[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Build Status][github-image]][github-url]
[![Test Coverage][coveralls-image]][coveralls-url]

Runs a test function with all possible combinations of its parameters.

# Usage

## Sync only
```ts
const result = []
const testVariants = createTestVariants(({a, b, c}: { a: number, b: string, c: boolean }) => {
    result.push([a, b, c])
})
const count = await testVariants({
    a: [1, 2],
    b: ['3', '4'],
    c: [true, false],
})({
  pauseInterval: 10000, // pause after each 10 seconds and log inerations count, it needed for karma tests
  pauseTime: 10, // continue after 10 milliseconds
})

// result == [
//     [1, '3', true],
//     [1, '3', false],
//     [1, '4', true],
//     [1, '4', false],
//     [2, '3', true],
//     [2, '3', false],
//     [2, '4', true],
//     [2, '4', false],
// ]
// count == 8
```

## Async
```ts
const result = []
const testVariants = createTestVariants(async ({a, b, c}: { a: number, b: string, c: boolean }) => {
  await delay(10)
  result.push([a, b, c])
})
const count = await testVariants({
    a: [1, 2],
    b: ['3', '4'],
    c: [true, false],
})() // no extra parameters
```

## Calculable variants
```ts
const result = []
const testVariants = createTestVariants(async ({a, b, c}: { a: number, b: number, c: number }) => {
  await delay(10)
  result.push([a, b, c])
})
const count = await testVariants({
    a: [1, 2],
    b: ({a}) => [ a + 1, a + 2 ], // you can use 'a', but you can't use 'c' because it will initialize after 'b' 
    c: ({a, b}) => [ a, b, a + b ],
})()
```

# License

[Unlimited Free](LICENSE)

[npm-image]: https://img.shields.io/npm/v/@flemist/group-similar-images.svg
[npm-url]: https://npmjs.org/package/@flemist/group-similar-images
[downloads-image]: https://img.shields.io/npm/dm/@flemist/group-similar-images.svg
[downloads-url]: https://npmjs.org/package/@flemist/group-similar-images
[github-image]: https://github.com/NikolayMakhonin/group-similar-images/actions/workflows/test.yml/badge.svg
[github-url]: https://github.com/NikolayMakhonin/group-similar-images/actions
[coveralls-image]: https://coveralls.io/repos/github/NikolayMakhonin/group-similar-images/badge.svg
[coveralls-url]: https://coveralls.io/github/NikolayMakhonin/group-similar-images
