import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: [
        'vue',
        {
          'naive-ui': [
            'useDialog',
            'useMessage',
            'useNotification',
            'useLoadingBar'
          ]
        }
      ]
    }),
    Components({
      resolvers: [NaiveUiResolver()]
    })
  ],
  server: {
    allowedHosts: ['malayrental.cn'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        // @ts-ignore
        router: (req: any) => {
          const host = req.headers.host
          if (host && host.includes('malayrental.cn')) {
            return 'https://paladiyu.com'
          }
          return 'http://127.0.0.1:5000'
        }
      }
    }
  },
  preview: {
    allowedHosts: ['malayrental.cn'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        // @ts-ignore
        router: (req: any) => {
          const host = req.headers.host
          if (host && host.includes('malayrental.cn')) {
            return 'https://paladiyu.com'
          }
          return 'http://127.0.0.1:5000'
        }
      }
    }
  }
})
