# Socorro Animal

Site: **https://socorroanimal.online/**

Página brasileira com seleção de doações, 940 comentários paginados, FAQ e Pix dentro do próprio site.

## Hospedagem

- **GitHub Pages:** publica somente a pasta `site/`, por GitHub Actions, quando há um push na branch `main`.
- **Hostinger:** mantém o registro e o DNS de `socorroanimal.online`. Não é necessário contratar hospedagem PHP.
- **Supabase:** projeto separado “Socorro Animal”, na organização Magemind, executa o servidor Pix e guarda os registros privados das cobranças.
- **PagueZy:** processa os pagamentos. Nenhuma chave de pagamento fica no código publicado.

O GitHub Pages não executa PHP. Por isso, a integração PHP local anterior foi adaptada para uma função de servidor em TypeScript. O layout e os valores em reais foram mantidos. O vídeo agora faz parte dos arquivos do site.

## Editar a página

Arquivo principal: [`site/index.html`](site/index.html).

Arquivos do Pix: [`site/assets/pix.js`](site/assets/pix.js), [`site/assets/pix.css`](site/assets/pix.css) e o banner em `site/assets/checkout-banner.jpg`.

O fluxo é: selecionar o valor → clicar em Ajudar → ler o QR Code ou copiar o código → pagar no banco → aguardar a confirmação da PagueZy. Não há redirecionamento para checkout externo nem pedido de nome/CPF.

## Meta Pixel

O Pixel `1765726981167401` registra `PageView` na visita. O evento `Purchase` é enviado com o valor confirmado e `BRL` somente quando a consulta autenticada do Pix retorna `paid` em produção. Um identificador local derivado do hash da cobrança evita repetir a conversão no mesmo navegador. Criar o Pix, copiar o código ou clicar em “Já paguei” não gera compra; pagamentos de sandbox também não.

Como esta integração é pelo navegador, uma doação confirmada enquanto a página está fechada pode não ser contabilizada no Meta. A cobertura desses casos exige integração server-side com a API de Conversões (CAPI), credencial do Meta e confirmação do Pix por webhook.

## Servidor do Pix

- Produção: `https://lfvnnxdbphxbscnrrpoi.supabase.co/functions/v1/pix`
- Sandbox: `https://lfvnnxdbphxbscnrrpoi.supabase.co/functions/v1/pix-sandbox`
- Webhook de produção: `https://lfvnnxdbphxbscnrrpoi.supabase.co/functions/v1/pix?action=webhook`
- Código: [`supabase/functions/_shared/handler.ts`](supabase/functions/_shared/handler.ts).

Os segredos são variáveis do servidor Supabase. `.env.example` documenta os nomes; `.env.local` existe somente no computador de configuração e é ignorado pelo Git. Não coloque credenciais em `site/`, commits, Actions ou documentação.

O endpoint usa uma sessão assinada própria para doadores anônimos; por isso, a verificação do JWT padrão do Supabase está desabilitada **nessas duas funções**, e a autenticação acontece dentro do código. Não há login obrigatório para doar. O servidor valida origem, assinatura da sessão, CSRF, valores em centavos e propriedade de cada cobrança. Solicitações repetidas reaproveitam a cobrança e não repetem automaticamente um POST incerto. Há limite de dez novas cobranças por IP em dez minutos.

A tabela `socorro_pix_payments` tem RLS e acesso revogado para `anon` e `authenticated`, com política explícita de negação. Só o servidor acessa os registros. O status `paid` só vem da API autenticada da PagueZy ou de um webhook HMAC válido, nunca do botão “Já paguei”.

O webhook é opcional para a confirmação enquanto a página está aberta: o site consulta a PagueZy a cada cinco segundos. Para receber eventos também com a página fechada, cadastre a URL de webhook acima no painel PagueZy e use o segredo correspondente configurado no servidor. Não exponha esse segredo no repositório.

## Publicar alterações

Faça commit e push na `main`. O workflow [`pages.yml`](.github/workflows/pages.yml) roda os testes, verifica o site e publica o artefato estático. A pasta `supabase/` e o banco de pagamentos não são publicados no Pages.

Alterações no servidor precisam ser implantadas no Supabase, separadamente:

```sh
supabase functions deploy pix --project-ref lfvnnxdbphxbscnrrpoi
supabase functions deploy pix-sandbox --project-ref lfvnnxdbphxbscnrrpoi
```

O CLI usa a conta Supabase autenticada. Os segredos permanecem no ambiente; não precisam ser colocados no código. Migrações em `supabase/migrations/` correspondem às versões já aplicadas no projeto.

## Testes

Com Node.js 24 ou superior:

```sh
npm test
npm run check
```

Os testes usam um provedor falso, sem dinheiro ou segredos reais. A integração real de sandbox foi verificada separadamente, incluindo criação, reaproveitamento e simulação de recebimento pela API oficial. O QR Code é gerado localmente com a biblioteca MIT incluída em `site/assets/vendor/`.

## Domínio e DNS

As instruções para conectar a Hostinger ao Pages estão em [`DNS-HOSTINGER.md`](DNS-HOSTINGER.md). A publicação no domínio depende desses registros e da propagação do DNS. O certificado HTTPS é emitido pelo GitHub após a validação do domínio.

## Referências oficiais

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Domínio próprio no Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [PagueZy](https://paguezy.com/docs)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

## Conferência da publicação — 06/11/2026

O site foi publicado por GitHub Actions e o DNS da Hostinger foi conferido com os quatro IPs do Pages e o CNAME do www. O certificado HTTPS está aprovado para o domínio e o www, com redirecionamento obrigatório de HTTP para HTTPS.

A criação e a confirmação em sandbox passaram. Após falhas iniciais HTTP 500 na PagueZy, uma nova conferência no site publicado gerou uma cobrança de R$ 20,00 em produção, com ID de transação, QR Code e Pix Copia e Cola. A cópia do código e a consulta de status funcionaram; a cobrança ficou aguardando pagamento. Não houve transferência de dinheiro nem confirmação de pagamento real nesse teste. A causa das falhas anteriores não foi confirmada pela plataforma.


## Valor personalizado e vídeo da capa

A última opção de doação é **Outro valor**. O campo aceita reais e centavos no formato brasileiro (por exemplo, `37,45`) e atualiza o botão antes de gerar o Pix. Navegador, função e banco validam centavos inteiros positivos; o limite técnico é o da coluna `integer`. Os sete valores sugeridos continuam disponíveis e o padrão é R$ 20,00.

O vídeo enviado pelo responsável está em `site/videos/vsl-video.mp4`, com H.264/AAC e metadados de início rápido. A proporção original de 922 × 720 é preservada sem recorte. O player aparece ao lado do texto no computador e dentro do texto da capa no celular, antes dos botões. A imagem de capa é um quadro do próprio vídeo; o arquivo só é carregado quando a reprodução começa.

O checkout atual usa `pix-checkout.js` como módulo. O arquivo anterior `pix.js` permanece para compatibilidade com páginas antigas ainda no cache do navegador; os novos arquivos têm URLs próprias para evitar misturar as duas versões.
