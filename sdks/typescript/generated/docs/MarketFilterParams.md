
# MarketFilterParams


## Properties

Name | Type
------------ | -------------
`limit` | number
`offset` | number
`sort` | string
`searchIn` | string
`query` | string
`slug` | string
`page` | number
`similarityThreshold` | number

## Example

```typescript
import type { MarketFilterParams } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "limit": null,
  "offset": null,
  "sort": null,
  "searchIn": null,
  "query": null,
  "slug": null,
  "page": null,
  "similarityThreshold": null,
} satisfies MarketFilterParams

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as MarketFilterParams
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


