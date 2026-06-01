'use client'
import { SessionProvider } from 'next-auth/react'
import { useEffect } from 'react'
import { ToastContainer } from 'react-toastify'
import { DEFAULT_PAGE_TITLE } from '@/context/constants'
import dynamic from 'next/dynamic'
const LayoutProvider = dynamic(() => import('@/context/useLayoutContext').then((mod) => mod.LayoutProvider), {
  ssr: false,
})
import { NotificationProvider } from '@/context/useNotificationContext'
import { ChildrenType } from '@/types/component-props'
import type { Session } from 'next-auth'

const AppProvidersWrapper = ({ children, session }: ChildrenType & { session?: Session | null }) => {
  const handleChangeTitle = () => {
    if (document.visibilityState == 'hidden') document.title = 'SAMA'
    else document.title = DEFAULT_PAGE_TITLE
  }

  useEffect(() => {
    const removeSplash = () => {
      document.getElementById('splash-screen')?.classList.add('remove')
    }

    removeSplash()
    const t1 = window.setTimeout(removeSplash, 50)
    const t2 = window.setTimeout(removeSplash, 500)
    window.addEventListener('load', removeSplash)

    document.addEventListener('visibilitychange', handleChangeTitle)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('load', removeSplash)
      document.removeEventListener('visibilitychange', handleChangeTitle)
    }
  }, [])

  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <LayoutProvider>
        <NotificationProvider>
          {children}
          <ToastContainer theme="colored" />
        </NotificationProvider>
      </LayoutProvider>
    </SessionProvider>
  )
}
export default AppProvidersWrapper
