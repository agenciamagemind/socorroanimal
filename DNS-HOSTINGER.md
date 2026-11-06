# Conectar socorroanimal.online

O domínio continua registrado na Hostinger. Mantenha os nameservers atuais e altere apenas a zona DNS, depois de o domínio estar cadastrado em **Settings → Pages** deste repositório.

No gerenciamento de DNS de `socorroanimal.online`, configure:

| Tipo | Nome | Destino | TTL sugerido |
|---|---|---|---|
| A | @ | 185.199.108.153 | 300 |
| A | @ | 185.199.109.153 | 300 |
| A | @ | 185.199.110.153 | 300 |
| A | @ | 185.199.111.153 | 300 |
| CNAME | www | agenciamagemind.github.io | 300 |

Substitua os registros de estacionamento que existirem para `@` e `www`, para que não disputem com os acima. Na conferência inicial, `@` apontava para `2.57.91.91`. Não remova registros MX/TXT de e-mail ou verificação. Não crie um CNAME para `@`, nem acrescente `/socorroanimal` ao destino do `www`.

Se houver registros AAAA para `@`, remova os de outro provedor ou substitua pelos IPv6 oficiais do Pages:

```text
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

É possível usar apenas os quatro registros A e o CNAME, sem configurar IPv6.

Depois de salvar, a propagação e a emissão do certificado podem levar até 24 horas. Quando o GitHub informar que o certificado está disponível, ative **Enforce HTTPS** em Settings → Pages. O site deve abrir em `https://socorroanimal.online/`, com redirecionamento de `www` para o endereço principal.

Para verificar no Windows:

```powershell
Resolve-DnsName socorroanimal.online -Type A
Resolve-DnsName www.socorroanimal.online -Type CNAME
```

Não altere registros de outros domínios. Referência: [documentação oficial do GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
