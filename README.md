# Reproducer: reload crashes in `Scheduler::uiManagerDidDispatchCommand` (facebook/react-native#58601)

Made from [react-native-community/reproducer-react-native](https://github.com/react-native-community/reproducer-react-native)
(React Native 0.88.0, `latest` on npm when this was made). `ReproducerApp/App.tsx` uses only `react-native` APIs; the
template's own dependencies are untouched.

A view command (`scrollTo`, `focus()`, `blur()`) queued in the same JS task as `DevSettings.reload()`, followed by a
short stretch where the JS thread stays busy, crashes the app on the JS thread inside the lambda that
`Scheduler::uiManagerDidDispatchCommand` deferred through `scheduleRenderingUpdate`. The app reloads itself in a loop and
counts its reloads in `NSUserDefaults`, so the crash rate is measured instead of hoped for.

## Versions

- react-native 0.88.0, react 19.3.0, Hermes, New Architecture (bridgeless, the template default), debug build
- iOS 26.5 simulator (iPhone 17 Pro), Xcode 27.1, macOS 26.6
- iOS only (`Settings` is the iOS storage the loop counts in)

## Steps

```sh
cd ReproducerApp
npm install                   # tested with `bun install`; yarn or npm install the same packages
(cd ios && bundle install && bundle exec pod install)   # tested with plain `pod install`
npm start                     # terminal 1: Metro on 8081
npm run ios                   # terminal 2: builds, installs and launches the app
./loop.sh 90 first-run        # lets the app reload itself for 90 s, relaunches it after each crash, prints the counts
```

`App.tsx` focuses a `TextInput`, then queues `commandBurst` commands (`scrollTo` on the `ScrollView`, `focus()` and `blur()`
on the input), calls `DevSettings.reload()` in the same task and busy-waits `busyAfterReloadMs`. Every knob is in
`config.json`; `./variant.sh <label> <seconds> '<json>'` rewrites it and runs the loop. `loop.sh` counts a crash as the app
process disappearing (macOS stops writing crash reports after the first few of a loop).

## Expected / actual

- Expected: the app reloads forever.
- Actual, with the committed `config.json`: it dies on nearly every reload, `EXC_BAD_ACCESS` on the JS thread:

```
com.facebook.react.runtime.JavaScript
0  ?
1  React  facebook::react::Scheduler::uiManagerDidDispatchCommand(...)::$_0::operator()() const
...
6  React  std::function<void ()>::operator()() const
7  React  facebook::react::RuntimeScheduler_Modern::updateRendering(...)
8  React  facebook::react::RuntimeScheduler_Modern::runEventLoopTick(...)
9  React  facebook::react::RuntimeScheduler_Modern::runEventLoop(...)
```

## Rates (relaunching after each crash; crashes / reload attempts)

| Variant | Crashes / reloads |
|---|---|
| committed: 20 `scrollTo` + `focus()`/`blur()` queued, `reload()`, JS busy 100 ms (300 s) | 46 / 52 |
| 20 `scrollTo` only, busy 100 ms, no `TextInput` rendered | 18 / 27 |
| 1 `scrollTo`, busy 100 ms | 19 / 20 |
| committed, but no busy time after `reload()` | 0 / 43 |
| focused field, plain `reload()`, nothing queued | 0 / 44 |
| committed, with `Keyboard.dismiss()` and `reload()` one frame later | 0 / 49 |
| the same mitigation, with the burst queued at the `reload()` call | 14 / 14 |

A focused `TextInput` is not needed; queued commands are. A plain reload with a focused field, a slow unmount, rapid
re-renders or hundreds of views (all with nothing queued) did not crash in about 450 reloads in an earlier Expo-based
version of this app.

## Mechanism

`-[RCTInstance invalidate]` calls `[_surfacePresenter suspend]` on the main thread before it dispatches its teardown block
to the JS thread. Suspending releases the `RCTScheduler`, whose delegate proxy is freed. A lambda deferred by
`uiManagerDidDispatchCommand` (or `uiManagerDidFinishTransaction`) still holds the raw `delegate_`. If the JS thread is
still in the task that queued it, it drains the lambda in `updateRendering` afterwards and calls into the freed delegate.
That is why the busy time after `reload()` matters: it keeps the JS thread in the task while the main thread suspends.

## Mitigation

Dismissing the keyboard (blur) and reloading one animation frame later drained the queued commands before the reload:
0 crashes in 49 reloads (and in 48 with a 100 ms delay in the Expo version). It only covers commands queued before the
reload; commands queued at the `reload()` call itself still crash 14 of 14.
