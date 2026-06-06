import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'little-tools',
  description: '一组自用的桌面 / 效率小工具合集',
  lastUpdated: true,
  cleanUrls: true,
  head: [
    ['meta', { name: 'theme-color', content: '#d97706' }],
  ],
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: 'flying-notifier', link: '/flying-notifier' },
      { text: 'GitHub', link: 'https://github.com/ymzlsy/little-tools' },
    ],
    sidebar: [
      {
        text: '工具',
        items: [
          { text: '✈️ flying-notifier', link: '/flying-notifier' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ymzlsy/little-tools' },
    ],
    footer: {
      message: 'MIT Licensed',
      copyright: '© 2026 杨明哲 (Mike)',
    },
    outline: { label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
  },
})
