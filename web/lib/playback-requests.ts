// A multi-step action owns one ticket from its first asynchronous operation.
// Stop/Play change the core intent; another selection changes the request.
// Neither may be undone by an older save or preparation completing late.
export function createPlaybackRequests(intent: { readonly current: number }) {
  let request = 0;
  const begin = () => ({ request: ++request, intent: intent.current });
  const isCurrent = (ticket: ReturnType<typeof begin>) => ticket.request === request && ticket.intent === intent.current;
  return {
    begin,
    isCurrent,
    async run<T>(prepare: () => Promise<T>, commit: (result: T) => void | Promise<void>): Promise<T> {
      const ticket = begin();
      const result = await prepare();
      if (isCurrent(ticket)) await commit(result);
      return result;
    },
  };
}
