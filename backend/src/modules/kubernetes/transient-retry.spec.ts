import { isTransientNetworkError, retryTransient } from './kubernetes.service';

describe('retryTransient', () => {
  const timeout = Object.assign(new Error('connect ETIMEDOUT 1.2.3.4:6443'), { code: 'ETIMEDOUT' });

  it('classifies connection failures as transient, API responses not', () => {
    expect(isTransientNetworkError(timeout)).toBe(true);
    expect(isTransientNetworkError({ code: 'ECONNRESET', response: { statusCode: 500 } })).toBe(false);
    expect(isTransientNetworkError(new Error('boom'))).toBe(false);
  });

  it('retries transient failures and then succeeds', async () => {
    const fn = jest.fn().mockRejectedValueOnce(timeout).mockResolvedValue('ok');
    await expect(retryTransient(fn, 3, 0)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt and does not retry other errors', async () => {
    const always = jest.fn().mockRejectedValue(timeout);
    await expect(retryTransient(always, 3, 0)).rejects.toBe(timeout);
    expect(always).toHaveBeenCalledTimes(3);

    const forbidden = { response: { statusCode: 403 } };
    const once = jest.fn().mockRejectedValue(forbidden);
    await expect(retryTransient(once, 3, 0)).rejects.toBe(forbidden);
    expect(once).toHaveBeenCalledTimes(1);
  });
});
