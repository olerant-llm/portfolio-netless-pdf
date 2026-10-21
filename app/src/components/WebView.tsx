import { useState, useMemo } from 'react'
import { 
  Search as SearchIcon, 
  ChevronRight as ChevronRightIcon
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Tool, ToolCategory } from '../types'
import { t } from '../i18n/ja'

const categoryColors: Record<ToolCategory, { bg: string, text: string, border: string, hover: string, glow: string }> = {
  Edit: { 
    bg: 'bg-rose-50 dark:bg-rose-900/20', 
    text: 'text-rose-500', 
    border: 'border-rose-100 dark:border-rose-900/30',
    hover: 'group-hover:bg-rose-500',
    glow: 'dark:hover:shadow-rose-900/20'
  },
  Secure: { 
    bg: 'bg-indigo-50 dark:bg-indigo-900/20', 
    text: 'text-indigo-500', 
    border: 'border-indigo-100 dark:border-indigo-900/30',
    hover: 'group-hover:bg-indigo-500',
    glow: 'dark:hover:shadow-indigo-900/20'
  },
  Convert: { 
    bg: 'bg-emerald-50 dark:bg-emerald-900/20', 
    text: 'text-emerald-500', 
    border: 'border-emerald-100 dark:border-emerald-900/30',
    hover: 'group-hover:bg-emerald-500',
    glow: 'dark:hover:shadow-emerald-900/20'
  },
  Optimize: { 
    bg: 'bg-amber-50 dark:bg-amber-900/20', 
    text: 'text-amber-500', 
    border: 'border-amber-100 dark:border-amber-900/30',
    hover: 'group-hover:bg-amber-500',
    glow: 'dark:hover:shadow-amber-900/20'
  }
}

const ToolCard = ({ title, desc, icon: Icon, onClick, category }: Tool & { onClick?: () => void }) => {
  const colors = categoryColors[category] || categoryColors.Edit
  
  return (
    <button 
      onClick={onClick}
      className="group relative flex flex-col p-6 rounded-[2rem] bg-white dark:bg-zinc-900/40 border border-gray-100 dark:border-white/5 hover:border-rose-500/50 dark:hover:border-rose-500/50 transition-all duration-300 text-left hover:shadow-2xl hover:shadow-rose-500/5 hover:-translate-y-1"
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${colors.bg} ${colors.text} group-hover:bg-rose-500 group-hover:text-white transition-all duration-500`}>
        <Icon size={24} strokeWidth={2} />
      </div>
      <h3 className="font-black text-gray-900 dark:text-white mb-2 text-lg tracking-tight group-hover:text-rose-500 transition-colors">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-zinc-400 font-medium leading-relaxed line-clamp-2">{desc}</p>
      
      <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-rose-500">
        <ChevronRightIcon size={20} />
      </div>
    </button>
  )
}

export default function WebView({ tools }: { tools: Tool[] }) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('すべて')

  const categories = ['すべて', '編集', 'セキュリティ', '変換', '最適化']

  const filteredTools = useMemo(() => {
    return tools.filter(tool => {
      const matchesSearch = tool.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           tool.desc.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = activeCategory === 'すべて' || tool.category === activeCategory
      return matchesSearch && matchesCategory
    })
  }, [tools, searchQuery, activeCategory])

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-black transition-colors duration-500">
      {/* Hero Section */}
      <section className="relative pt-10 pb-8 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight dark:text-white mb-4">
            {t.app.name}
          </h1>
          <p className="text-gray-500 dark:text-zinc-400 text-sm md:text-base max-w-xl mx-auto mb-6 font-medium">
            {t.app.tagline}
          </p>
          
          <div className="max-w-xl mx-auto relative group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-rose-500 transition-colors">
              <SearchIcon size={18} />
            </div>
            <input 
              type="text"
              placeholder="機能を検索（例：結合、分割、トリミング…）"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 rounded-2xl py-3.5 pl-12 pr-6 shadow-sm focus:border-rose-500 outline-none transition-all font-bold text-sm dark:text-white"
            />
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 pb-32">
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Main Grid */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-8">
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-5 py-2 rounded-full text-xs font-bold transition-all border ${activeCategory === cat ? 'bg-zinc-900 dark:bg-white text-white dark:text-black border-transparent shadow-lg' : 'bg-white dark:bg-zinc-900 text-gray-400 border-gray-100 dark:border-white/5 hover:border-rose-500'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <p className="hidden md:block text-xs font-bold text-gray-400">{filteredTools.length} 個の機能を表示中</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTools.map((tool) => (
                <ToolCard 
                  key={tool.title} 
                  {...tool} 
                  onClick={() => navigate(tool.path || '/')}
                />
              ))}
            </div>

            {filteredTools.length === 0 && (
              <div className="py-24 text-center">
                <div className="w-20 h-20 bg-gray-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300">
                  <SearchIcon size={32} />
                </div>
                <h3 className="text-2xl font-black dark:text-white mb-2">該当する機能が見つかりません</h3>
                <p className="text-gray-500 dark:text-zinc-400 font-medium">別のキーワードで検索するか、カテゴリーを変更してください。</p>
                <button onClick={() => { setSearchQuery(''); setActiveCategory('すべて'); }} className="mt-8 text-rose-500 font-bold text-sm hover:underline">検索条件をリセット</button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}