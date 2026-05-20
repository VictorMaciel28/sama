import type { ChildrenType } from '@/types/component-props'

/** Página pública de etiqueta — fora do layout admin, fundo neutro. */
export default function EmbalagemPublicoLayout({ children }: ChildrenType) {
  return (
    <div
      className="emb-publico-root min-vh-100 py-4 py-md-5"
      style={{
        background: 'linear-gradient(165deg, #e8eef6 0%, #f0f4fa 35%, #f8fafc 70%, #ffffff 100%)',
      }}
    >
      {children}
    </div>
  )
}
