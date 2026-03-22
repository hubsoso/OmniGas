import { Head, Html, Main, NextScript } from 'next/document'

const themeInitScript = `(function(){try{var stored=localStorage.getItem('wallet-theme');var mode=(stored==='dark'||stored==='light'||stored==='system')?stored:'system';var systemDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='dark'||(mode==='system'&&systemDark)?'dark':'light';var root=document.documentElement;root.dataset.theme=resolved;root.dataset.themeMode=mode;root.style.colorScheme=resolved;if(document.body){document.body.dataset.theme=resolved;document.body.style.colorScheme=resolved;}}catch(e){}})();`

export default function Document() {
  return (
    <Html lang="zh-CN" suppressHydrationWarning>
      <Head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}

