type Size = 'sm' | 'md' | 'lg'

const HEIGHT: Record<Size, number> = { sm: 22, md: 28, lg: 34 }

/** App header — vektör wordmark */
export function MatriksLogo({ size = 'md' }: { size?: Size }) {
  const h = HEIGHT[size]
  return (
    <img
      src="/matriks-ai-wordmark.svg"
      alt="MATRIKS Ai"
      height={h}
      className="select-none"
      style={{ height: h, width: 'auto' }}
      draggable={false}
    />
  )
}

/** Login kartı üstü — senin verdiğin şeffaf logo */
export function LoginBrandHeader() {
  return (
    <div className="flex flex-col items-center text-center">
      <img
        src="/matriks-login-header.png"
        alt="MATRIKS Ai MCP"
        className="mx-auto h-auto w-[230px] max-w-full select-none bg-transparent object-contain sm:w-[270px]"
        draggable={false}
      />
      <p className="mt-2 text-[15px] font-medium text-[#6B7280]">
        Management Portal
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8B7CF0]">
        Content Portal · Local
      </p>
    </div>
  )
}
