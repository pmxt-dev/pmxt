import { Limitless } from '../pmxt/client';

describe('Limitless watch methods', () => {
  function makeClient(responseData: unknown) {
    const client: any = new Limitless({ autoStartServer: false });
    client.sidecarPostRequest = jest.fn(async (method: string, args: unknown[]) => ({
      success: true,
      data: responseData,
      _method: method,
      _args: args,
    }));
    return client;
  }

  it('forwards watchPrices to the Limitless sidecar endpoint and invokes the callback', async () => {
    const payload = { marketAddress: '0xabc', updatedPrices: { YES: '0.42' } };
    const client = makeClient(payload);
    const callback = jest.fn();

    await expect(client.watchPrices('0xabc', callback)).resolves.toEqual(payload);
    expect(client.sidecarPostRequest).toHaveBeenCalledWith('watchPrices', ['0xabc']);
    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('forwards watchUserPositions with credentials and converts returned positions', async () => {
    const positions = [{ marketId: 'm1', outcomeId: 'yes', size: 1 }];
    const client = makeClient(positions);
    const callback = jest.fn();

    await expect(client.watchUserPositions(callback)).resolves.toEqual(positions);
    expect(client.sidecarPostRequest).toHaveBeenCalledWith('watchUserPositions', []);
    expect(callback).toHaveBeenCalledWith(positions);
  });

  it('forwards watchUserTransactions and invokes the callback', async () => {
    const transaction = { hash: '0x123', status: 'confirmed' };
    const client = makeClient(transaction);
    const callback = jest.fn();

    await expect(client.watchUserTransactions(callback)).resolves.toEqual(transaction);
    expect(client.sidecarPostRequest).toHaveBeenCalledWith('watchUserTransactions', []);
    expect(callback).toHaveBeenCalledWith(transaction);
  });
});
