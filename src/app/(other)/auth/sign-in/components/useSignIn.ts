'use client'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'

import { useNotificationContext } from '@/context/useNotificationContext'
import useQueryParams from '@/hooks/useQueryParams'

const useSignIn = () => {
  const [loading, setLoading] = useState(false)
  const { push } = useRouter()
  const { showNotification } = useNotificationContext()

  const queryParams = useQueryParams()

  const loginFormSchema = yup.object({
    email: yup.string().email('Please enter a valid email').required('Please enter your email'),
    password: yup.string().required('Please enter your password'),
  })

  const { control, handleSubmit } = useForm({
    resolver: yupResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  type LoginFormFields = yup.InferType<typeof loginFormSchema>

  const login = handleSubmit(async (values: LoginFormFields) => {
    setLoading(true)
    try {
      const res = await signIn('credentials', {
        redirect: false,
        email: values?.email,
        password: values?.password,
      })
      if (res?.ok) {
        let dest = queryParams['redirectTo'] ?? '/pedidos'
        try {
          const meRes = await fetch('/api/me/vendedor', { cache: 'no-store' })
          const meJson = await meRes.json()
          if (meJson?.ok && meJson?.data?.tipo === 'VENDEDOR_COMERCIAL') {
            const rt = queryParams['redirectTo']
            dest = rt && String(rt).startsWith('/comercial') ? String(rt) : '/comercial/orcamentos'
          }
        } catch {
          /* mantém destino padrão */
        }
        push(dest)
        showNotification({ message: 'Successfully logged in. Redirecting....', variant: 'success' })
      } else {
        showNotification({ message: res?.error ?? '', variant: 'danger' })
      }
    } finally {
      setLoading(false)
    }
  })

  return { loading, login, control }
}

export default useSignIn
