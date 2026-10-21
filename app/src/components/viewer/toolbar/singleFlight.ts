/** 同じ処理を同時に2本走らせないための見張り。実行中の呼び出しは何もせずに終わる */
export function createSingleFlight() {
  let busy = false
  return {
    running: () => busy,
    async run(task: () => Promise<unknown>) {
      if (busy) return
      busy = true
      try {
        await task()
      } finally {
        busy = false
      }
    },
  }
}
