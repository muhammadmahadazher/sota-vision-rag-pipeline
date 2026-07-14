## 2024-07-14 - Optimize StreamController Object Density Computation
**Learning:** Wrapping complex filtering (`reduce`) and array mapping/sorting (`Object.entries().sort()`) inside a `useMemo` hook is an effective, simple way to avoid unnecessary computation in frequently rendered React components, especially with large datasets or deep updates.
**Action:** Always verify if complex computations mapped directly in the functional body of a React component can be optimized by memoizing them with `useMemo`, ensuring they only update when relevant dependencies change.
