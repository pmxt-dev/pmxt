
# UnifiedMarket


## Properties

Name | Type
------------ | -------------
`marketId` | string
`title` | string
`description` | string
`outcomes` | [Array&lt;MarketOutcome&gt;](MarketOutcome.md)
`resolutionDate` | Date
`volume24h` | number
`volume` | number
`liquidity` | number
`openInterest` | number
`url` | string
`image` | string
`category` | string
`tags` | Array&lt;string&gt;
`yes` | [MarketOutcome](MarketOutcome.md)
`no` | [MarketOutcome](MarketOutcome.md)
`up` | [MarketOutcome](MarketOutcome.md)
`down` | [MarketOutcome](MarketOutcome.md)

## Example

```typescript
import type { UnifiedMarket } from 'pmxtjs'

// TODO: Update the object below with actual values
const example = {
  "marketId": null,
  "title": null,
  "description": null,
  "outcomes": null,
  "resolutionDate": null,
  "volume24h": null,
  "volume": null,
  "liquidity": null,
  "openInterest": null,
  "url": null,
  "image": null,
  "category": null,
  "tags": null,
  "yes": null,
  "no": null,
  "up": null,
  "down": null,
} satisfies UnifiedMarket

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as UnifiedMarket
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


