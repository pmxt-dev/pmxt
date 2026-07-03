import {
  LIMITLESS_VENUE_ESCROW_ADDRESSES,
  PREFUNDED_ESCROW_ADDRESSES,
  VENUE_ESCROW_ADDRESSES,
} from "../pmxt/constants";
import { validateTypedData } from "../pmxt/hosted-typed-data";

type HostedTypedData = Parameters<typeof validateTypedData>[0];

const WALLET_ADDRESS = "0x000000000000000000000000000000000000aBc1";
const POLYGON_CHAIN_ID = 137;
const BSC_CHAIN_ID = 56;
const BASE_CHAIN_ID = 8453;
const FUTURE_DEADLINE = 4_102_444_800;

function firstAddress(addresses: ReadonlySet<string>, label: string): string {
  const [address] = Array.from(addresses);
  if (!address) {
    throw new Error(`${label} must include at least one address`);
  }
  return address;
}

function fields(
  pairs: ReadonlyArray<readonly [string, string]>,
): Array<{ name: string; type: string }> {
  return pairs.map(([name, type]) => ({ name, type }));
}

function domain(
  name: string,
  verifyingContract: string,
  chainId: number,
): HostedTypedData["domain"] {
  return {
    name,
    version: "1",
    chainId,
    verifyingContract,
  };
}

function cancelOrderTypedData(
  verifyingContract: string,
  chainId: number = POLYGON_CHAIN_ID,
): HostedTypedData {
  return {
    types: {
      EIP712Domain: fields([
        ["name", "string"],
        ["version", "string"],
        ["chainId", "uint256"],
        ["verifyingContract", "address"],
      ]),
      CancelOrder: fields([
        ["user", "address"],
        ["path", "uint8"],
        ["nonce", "uint256"],
        ["deadline", "uint256"],
      ]),
    },
    primaryType: "CancelOrder",
    domain: domain("PreFundedEscrow", verifyingContract, chainId),
    message: {
      user: WALLET_ADDRESS,
      path: 0,
      nonce: 2001,
      deadline: FUTURE_DEADLINE,
    },
  };
}

function cancelPullTypedData(
  verifyingContract: string,
  chainId: number,
): HostedTypedData {
  return {
    types: {
      EIP712Domain: fields([
        ["name", "string"],
        ["version", "string"],
        ["chainId", "uint256"],
        ["verifyingContract", "address"],
      ]),
      CancelPull: fields([
        ["user", "address"],
        ["nonce", "uint256"],
        ["deadline", "uint256"],
      ]),
    },
    primaryType: "CancelPull",
    domain: domain("VenueEscrow", verifyingContract, chainId),
    message: {
      user: WALLET_ADDRESS,
      nonce: 2002,
      deadline: FUTURE_DEADLINE,
    },
  };
}

describe("hosted typed-data validation", () => {
  it.each([
    [
      "cancel_polymarket",
      cancelOrderTypedData(firstAddress(PREFUNDED_ESCROW_ADDRESSES, "prefunded")),
    ],
    [
      "cancel_opinion_polygon",
      cancelOrderTypedData(firstAddress(PREFUNDED_ESCROW_ADDRESSES, "prefunded")),
    ],
    [
      "cancel_opinion_bsc_pull",
      cancelPullTypedData(
        firstAddress(VENUE_ESCROW_ADDRESSES, "venue"),
        BSC_CHAIN_ID,
      ),
    ],
    [
      "cancel_limitless_polygon",
      cancelOrderTypedData(firstAddress(PREFUNDED_ESCROW_ADDRESSES, "prefunded")),
    ],
    [
      "cancel_limitless_base_pull",
      cancelPullTypedData(
        firstAddress(LIMITLESS_VENUE_ESCROW_ADDRESSES, "limitless venue"),
        BASE_CHAIN_ID,
      ),
    ],
  ])("accepts %s", (route, typedData) => {
    expect(() => {
      validateTypedData(typedData, route, WALLET_ADDRESS);
    }).not.toThrow();
  });
});
