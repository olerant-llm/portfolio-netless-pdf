/** ツールバーと小窓で共通に使う見た目。新しい部品だけがここを使う */
export const bigButtonClass =
  'flex flex-col items-center justify-center gap-1 min-w-[64px] px-2 pt-2 pb-1.5 rounded-xl '
  + 'text-[12px] leading-tight font-bold text-gray-700 dark:text-zinc-200 whitespace-nowrap '
  + 'hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors '
  + 'disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent'

export const separatorClass = 'self-stretch w-px my-2 mx-1 bg-gray-200 dark:bg-zinc-700 shrink-0'

export const menuItemClass =
  'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-[13px] font-bold '
  + 'text-gray-700 dark:text-zinc-200 hover:bg-rose-50 dark:hover:bg-zinc-800 '
  + 'focus:bg-rose-50 dark:focus:bg-zinc-800 outline-none disabled:opacity-35'

