/** Campos seguros para dev — nunca incluir senha SMTP. */

export type MailShareDiagnostics = {
  generatedAt: string
  recipient: string
  envelopeFrom: string
  subject: string
  attachment: { filename: string; bytes: number }
  smtp: {
    host: string
    port: number
    secure: boolean
    authUser: string | null
    authConfigured: boolean
  }
  connectionVerify: {
    attempted: boolean
    ok: boolean
    detail: string | null
  }
  nodemailer: {
    messageId: string | null
    /** Resposta bruta do servidor SMTP (primeira linha costuma ser "250 ...") */
    serverResponse: string | null
    accepted: string[]
    rejected: string[]
    pending?: unknown
    envelope?: { from?: string; to?: string[] }
  }
  /** Leitura humana para debug (não garante entrega ao provedor destino como Gmail) */
  interpretation: string[]
}

export function buildMailShareDiagnostics(args: {
  recipient: string
  envelopeFrom: string
  subject: string
  pdfFilename: string
  pdfByteLength: number
  host: string
  port: number
  secure: boolean
  authUser: string | null
  authConfigured: boolean
  verifyAttempted: boolean
  verifyOk: boolean
  verifyDetail: string | null
  messageId?: string | null
  serverResponse?: string | null
  accepted: unknown[]
  rejected: unknown[]
  pending?: unknown
  envelope?: { from?: string; to?: string[] }
}): MailShareDiagnostics {
  const accepted = (args.accepted || []).map((x) => String(x))
  const rejected = (args.rejected || []).map((x) => String(x))

  const interpretation: string[] = []

  interpretation.push(
    `"accepted" / "rejected" vêm da resposta do servidor SMTP ao DATA (comando RCPT TO). Lista vazia não significa falha — alguns hosts só preenchem messageId + response 250.`
  )

  if (args.verifyOk) {
    interpretation.push('SMTP verify(): conexão/autenticação testadas com sucesso antes do envio.')
  } else if (args.verifyDetail) {
    interpretation.push(
      `SMTP verify() falhou — o envio ainda pode ter sido tentado; confira credenciais/porta. Erro: ${args.verifyDetail}`
    )
  }

  if (args.messageId) {
    interpretation.push(
      `Message-ID presente: o servidor SMTP aceitou a mensagem na fila local. Não prova que o Gmail (ou outro) recebeu — há saltos até o MX do destinatário.`
    )
  }

  if (accepted.length === 0 && rejected.length === 0 && args.messageId) {
    interpretation.push(
      'accepted/rejected vazios com Message-ID: comportamento comum em alguns provedores; investigar logs do servidor de email (Hostgator/cPanel).'
    )
  }

  if (rejected.length > 0) {
    interpretation.push(`Endereços rejeitados na sessão SMTP: ${rejected.join(', ')}`)
  }

  if (accepted.some((a) => a.toLowerCase() === args.recipient.toLowerCase())) {
    interpretation.push('Seu destinatário aparece em "accepted": o último servidor SMTP da sessão aceitou entregar para esse RCPT.')
  }

  const resp = String(args.serverResponse || '')
  if (/id\s*=/i.test(resp)) {
    interpretation.push(
      'Resposta tipo Exim ("250 OK id=..."): marcou aceite na fila local. No cPanel/Hostgator, localize esse id nos logs de entrega (Exim / "Rastrear entrega"); confira se na sequência há conexão aos MX do Gmail (google.com) ou erro/deferimento.'
    )
  }

  interpretation.push(
    'Um 250 OK da submissão não garante inbox no Gmail: webmail pode usar caminho diferente da API (mesmo servidor). Falhas depois do 250 são fila outbound, reputação IP do relé, ou bloqueio no Google — não só "HTML ruim".'
  )

  if (args.pdfByteLength > 0) {
    interpretation.push(
      'Anexo: PDF presente. Se a entrega falhar só com anexo, teste removê-lo para isolar o filtro do provedor.'
    )
  } else {
    interpretation.push(
      'Envio apenas HTML (sem anexo), no mesmo molde do webhook de NF — minimiza MIME multipart pesado.'
    )
  }

  interpretation.push(
    'Se nada chega ao Gmail: SPF/DKIM/DMARC do domínio do FROM, reputação IP de saída, blacklist, ou atraso. Teste para outra caixa (Outlook.com) para isolar Gmail.'
  )

  return {
    generatedAt: new Date().toISOString(),
    recipient: args.recipient,
    envelopeFrom: args.envelopeFrom,
    subject: args.subject,
    attachment: { filename: args.pdfFilename, bytes: args.pdfByteLength },
    smtp: {
      host: args.host,
      port: args.port,
      secure: args.secure,
      authUser: args.authUser,
      authConfigured: args.authConfigured,
    },
    connectionVerify: {
      attempted: args.verifyAttempted,
      ok: args.verifyOk,
      detail: args.verifyDetail,
    },
    nodemailer: {
      messageId: args.messageId ?? null,
      serverResponse: args.serverResponse ?? null,
      accepted,
      rejected,
      pending: args.pending,
      envelope: args.envelope,
    },
    interpretation,
  }
}
