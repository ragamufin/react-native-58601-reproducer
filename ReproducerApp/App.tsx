import { useEffect, useRef, useState } from 'react';
import {
  DevSettings,
  Keyboard,
  ScrollView,
  Settings,
  Text,
  TextInput,
  View,
} from 'react-native';

import config from './config.json';

// Native storage (NSUserDefaults) survives a reload and a crash, so the loop counts itself.
const iteration = (Settings.get('iteration') ?? 0) + 1;
Settings.set({ iteration });
console.log(`[R58601] iteration=${iteration} config=${JSON.stringify(config)}`);

function busyWait(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function App() {
  const refs = useRef<Array<TextInput | null>>([]);
  const scrollRef = useRef<ScrollView>(null);
  const [tick, setTick] = useState(0);

  useEffect(
    () => () => {
      console.log('[R58601] unmount');
      busyWait(config.unmountBusyMs);
    },
    [],
  );

  useEffect(() => {
    // "rapid re-renders": keep React committing while the reload is pending.
    if (!config.busy) {
      return undefined;
    }
    const id = setInterval(() => setTick(t => t + 1), 16);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const focus = setTimeout(() => refs.current[0]?.focus(), config.focusDelayMs);
    // A burst of view commands queued in the same task as the reload: each one is a deferred lambda.
    const burst = () => {
      for (let i = 0; i < config.commandBurst; i++) {
        if (config.burstKind !== 'focus') {
          scrollRef.current?.scrollTo({ y: i % 7, animated: false });
        }
        if (config.burstKind !== 'scroll') {
          if (i % 2 === 0) {
            refs.current[0]?.focus();
          } else {
            refs.current[0]?.blur();
          }
        }
      }
    };
    const doReload = () => {
      if (config.burstWhere === 'atReload') {
        burst();
      }
      DevSettings.reload();
      // Keep the JS thread in this task while the host suspends the surface presenter on the main thread.
      busyWait(config.busyAfterReloadMs);
    };
    const reload = setTimeout(() => {
      console.log('[R58601] reload() attempt');
      if (config.burstWhere !== 'atReload') {
        burst();
      }
      if (config.mitigation === 'blur-then-frame') {
        Keyboard.dismiss();
        requestAnimationFrame(doReload);
      } else if (config.mitigation === 'blur-then-100ms') {
        Keyboard.dismiss();
        setTimeout(doReload, 100);
      } else {
        doReload();
      }
    }, config.focusDelayMs + config.reloadDelayMs);
    return () => {
      clearTimeout(focus);
      clearTimeout(reload);
    };
  }, []);

  const fields = Array.from({ length: config.inputs }, (_, i) => (
    <TextInput
      key={i}
      ref={r => {
        refs.current[i] = r;
      }}
      style={{ borderWidth: 1, margin: 8, padding: 8 }}
      placeholder={`field ${i}`}
    />
  ));
  const cards = Array.from({ length: config.views }, (_, i) => (
    <View
      key={i}
      style={{ margin: 2, padding: 4, borderWidth: 1, opacity: ((i + tick) % 10) / 10 + 0.1 }}>
      <Text>{`card ${i} ${tick}`}</Text>
    </View>
  ));
  const content = (
    <>
      {fields}
      {cards}
    </>
  );
  return (
    <View style={{ flex: 1, paddingTop: 80 }}>
      <Text testID="iteration">{`iteration ${iteration} tick ${tick}`}</Text>
      {config.scroll ? <ScrollView ref={scrollRef}>{content}</ScrollView> : <View>{content}</View>}
    </View>
  );
}

export default App;
