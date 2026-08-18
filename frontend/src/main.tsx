import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntdApp, theme as antdTheme } from 'antd'
import arEG from 'antd/locale/ar_EG'
import 'antd/dist/reset.css'
import App from './App'
import { store } from './app/store'
import './index.css'

const FONT = "'Cairo', 'Segoe UI', Tahoma, sans-serif"

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ConfigProvider
        direction="rtl"
        locale={arEG}
        theme={{
          algorithm: antdTheme.defaultAlgorithm,
          token: {
            // ELKADY TRAVEL brand palette: orange primary, navy, gold accent.
            colorPrimary: '#F07E1B',
            colorInfo: '#0B2E5E',
            colorSuccess: '#16a34a',
            colorWarning: '#F9B233',
            colorError: '#e11d48',
            colorTextBase: '#0f1e33',
            colorLink: '#0B2E5E',
            colorBgLayout: '#eef2f8',
            borderRadius: 10,
            borderRadiusLG: 14,
            fontFamily: FONT,
            fontSize: 14,
            controlHeight: 38,
            wireframe: false,
          },
          components: {
            Layout: {
              headerBg: '#0B2E5E',
              headerHeight: 64,
              headerPadding: '0 24px',
              bodyBg: '#eef2f8',
              siderBg: '#0A2242',
            },
            Menu: {
              darkItemBg: 'transparent',
              darkSubMenuItemBg: 'transparent',
              darkItemColor: 'rgba(219,229,245,0.80)',
              darkItemHoverColor: '#ffffff',
              darkItemHoverBg: 'rgba(240,126,27,0.16)',
              darkItemSelectedBg: '#F07E1B',
              darkItemSelectedColor: '#ffffff',
              itemHeight: 44,
              itemMarginInline: 8,
              itemBorderRadius: 8,
              fontSize: 15,
            },
            Card: { borderRadiusLG: 14, headerFontSize: 16 },
            Table: { headerBg: '#fff6ee', headerColor: '#8a4b16', cellPaddingBlock: 12 },
            Button: { fontWeight: 600, primaryShadow: 'none' },
            Statistic: { titleFontSize: 14 },
            Segmented: { itemSelectedBg: '#F07E1B', itemSelectedColor: '#ffffff' },
            Tabs: { inkBarColor: '#F07E1B', itemSelectedColor: '#0B2E5E' },
          },
        }}
      >
        <AntdApp>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AntdApp>
      </ConfigProvider>
    </Provider>
  </React.StrictMode>,
)
