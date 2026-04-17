import { MenuItemType } from '@/types/menu'

export const MENU_ITEMS: MenuItemType[] = [
  {
    key: 'custom',
    label: 'Menu',
    isTitle: true,
  },
  {
    key: 'vendas',
    label: 'Vendas',
    icon: 'ri:shopping-bag-3-line',
    children: [
      {
        key: 'pedidos',
        label: 'Pedidos de venda',
        icon: 'ri:menu-line',
        url: '/pedidos',
        parentKey: 'vendas',
      },
      {
        key: 'propostas',
        label: 'Propostas Comerciais',
        icon: 'ri:file-list-3-line',
        url: '/pedidos?entity=proposta',
        parentKey: 'vendas',
      },
    ],
  },
  {
    key: 'administracao',
    label: 'Administração',
    icon: 'ri:settings-3-line',
    children: [
      {
        key: 'clientes',
        label: 'Clientes',
        icon: 'ri:team-line',
        url: '/clientes',
        parentKey: 'administracao',
      },
      {
        key: 'vendedores',
        label: 'Vendedores',
        icon: 'ri:user-star-line',
        url: '/vendedores',
        parentKey: 'administracao',
      },
      {
        key: 'supervisores',
        label: 'Supervisores',
        icon: 'ri:user-settings-line',
        url: '/supervisores',
        parentKey: 'administracao',
      },
      {
        key: 'televendas',
        label: 'Televendas',
        icon: 'ri:phone-line',
        url: '/televendas',
        parentKey: 'administracao',
      },
      
      {
        key: 'condicoes-pagamento',
        label: 'Condições de pagamento',
        icon: 'ri:time-line',
        url: '/condicoes-pagamento',
        parentKey: 'administracao',
      },
      {
        key: 'devolucoes-solicitadas',
        label: 'Devoluções solicitadas',
        icon: 'ri:exchange-funds-line',
        url: '/devolucoes-solicitadas',
        parentKey: 'administracao',
      },
    ],
  },
  // {
  //   key: 'whatsapp',
  //   label: 'WhatsApp',
  //   icon: 'ri:whatsapp-line',
  //   url: '/whatsapp',
  // },
  {
    key: 'suprimentos',
    label: 'Suprimentos',
    icon: 'ri:archive-line',
    children: [
      {
        key: 'notas-fiscais',
        label: 'Notas Fiscais',
        icon: 'ri:file-text-line',
        url: '/suprimentos/notas-fiscais',
        parentKey: 'suprimentos',
      },
      {
        key: 'ordem-de-compra',
        label: 'Ordem de compra',
        icon: 'ri:shopping-cart-2-line',
        url: '/suprimentos/ordem-de-compra',
        parentKey: 'suprimentos',
      },
    ],
  },
  {
    key: 'comissoes',
    label: 'Comissões',
    icon: 'ri:money-dollar-circle-line',
    url: '/comissoes',
  },
  {
    key: 'supervisao',
    label: 'Supervisão',
    icon: 'ri:team-line',
    children: [
      {
        key: 'supervisao-vendas',
        label: 'Vendas',
        icon: 'ri:bar-chart-2-line',
        url: '/supervisao/vendas',
        parentKey: 'supervisao',
      },
      {
        key: 'supervisao-vendedores',
        label: 'Vendedores',
        icon: 'ri:user-star-line',
        url: '/supervisao/vendedores',
        parentKey: 'supervisao',
      },
      {
        key: 'supervisao-clientes',
        label: 'Clientes',
        icon: 'ri:team-line',
        url: '/supervisao/clientes',
        parentKey: 'supervisao',
      },
    ],
  },
]
