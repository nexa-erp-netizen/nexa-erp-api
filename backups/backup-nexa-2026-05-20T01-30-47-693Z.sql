--
-- PostgreSQL database dump
--

\restrict 9Z7OiioKfo7HRZYDrehj5a4kWjlusXc2QmASHyOzkuNAPePIS1sjdnSWoTdoWFp

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Clientes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Clientes" (
    id integer NOT NULL,
    nome character varying(255) NOT NULL,
    cpf character varying(255) NOT NULL,
    telefone character varying(255) NOT NULL,
    email character varying(255),
    cnpj character varying(255),
    regime character varying(255),
    endereco character varying(255),
    cidade character varying(255),
    estado character varying(255),
    observacao text,
    anexos json,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public."Clientes" OWNER TO postgres;

--
-- Name: Clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Clientes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Clientes_id_seq" OWNER TO postgres;

--
-- Name: Clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Clientes_id_seq" OWNED BY public."Clientes".id;


--
-- Name: DocumentoDigitals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."DocumentoDigitals" (
    id integer NOT NULL,
    cliente character varying(255) NOT NULL,
    tipo character varying(255) NOT NULL,
    "anoCalendario" character varying(255) NOT NULL,
    "dataEnvio" character varying(255),
    recibo character varying(255),
    status character varying(255) DEFAULT 'Arquivado'::character varying NOT NULL,
    observacao text,
    anexos json,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public."DocumentoDigitals" OWNER TO postgres;

--
-- Name: DocumentoDigitals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."DocumentoDigitals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."DocumentoDigitals_id_seq" OWNER TO postgres;

--
-- Name: DocumentoDigitals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."DocumentoDigitals_id_seq" OWNED BY public."DocumentoDigitals".id;


--
-- Name: Financeiros; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Financeiros" (
    id integer NOT NULL,
    descricao character varying(255) NOT NULL,
    cliente character varying(255) NOT NULL,
    tipo character varying(255) NOT NULL,
    valor character varying(255) NOT NULL,
    vencimento character varying(255) NOT NULL,
    status character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public."Financeiros" OWNER TO postgres;

--
-- Name: Financeiros_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Financeiros_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Financeiros_id_seq" OWNER TO postgres;

--
-- Name: Financeiros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Financeiros_id_seq" OWNED BY public."Financeiros".id;


--
-- Name: Fiscals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Fiscals" (
    id integer NOT NULL,
    cliente character varying(255) NOT NULL,
    obrigacao character varying(255) NOT NULL,
    competencia character varying(255) NOT NULL,
    vencimento character varying(255) NOT NULL,
    status character varying(255) NOT NULL,
    valor character varying(255),
    observacao text,
    anexos json,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "diasParaVencer" integer,
    "alertaFiscal" character varying(255)
);


ALTER TABLE public."Fiscals" OWNER TO postgres;

--
-- Name: Fiscals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Fiscals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Fiscals_id_seq" OWNER TO postgres;

--
-- Name: Fiscals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Fiscals_id_seq" OWNED BY public."Fiscals".id;


--
-- Name: LancamentoContabils; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."LancamentoContabils" (
    id integer NOT NULL,
    cliente character varying(255) NOT NULL,
    data character varying(255) NOT NULL,
    competencia character varying(255) NOT NULL,
    tipo character varying(255) NOT NULL,
    "planoConta" character varying(255) NOT NULL,
    descricao character varying(255) NOT NULL,
    valor character varying(255) NOT NULL,
    "formaPagamento" character varying(255),
    observacao text,
    anexos json,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public."LancamentoContabils" OWNER TO postgres;

--
-- Name: LancamentoContabils_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."LancamentoContabils_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."LancamentoContabils_id_seq" OWNER TO postgres;

--
-- Name: LancamentoContabils_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."LancamentoContabils_id_seq" OWNED BY public."LancamentoContabils".id;


--
-- Name: PlanoConta; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PlanoConta" (
    id integer NOT NULL,
    codigo character varying(255) NOT NULL,
    conta character varying(255) NOT NULL,
    tipo character varying(255) NOT NULL,
    natureza character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public."PlanoConta" OWNER TO postgres;

--
-- Name: PlanoConta_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."PlanoConta_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."PlanoConta_id_seq" OWNER TO postgres;

--
-- Name: PlanoConta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."PlanoConta_id_seq" OWNED BY public."PlanoConta".id;


--
-- Name: Servicos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Servicos" (
    id integer NOT NULL,
    nome character varying(255) NOT NULL,
    categoria character varying(255) NOT NULL,
    prazo character varying(255) NOT NULL,
    valor character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public."Servicos" OWNER TO postgres;

--
-- Name: Servicos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Servicos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Servicos_id_seq" OWNER TO postgres;

--
-- Name: Servicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Servicos_id_seq" OWNED BY public."Servicos".id;


--
-- Name: SolicitacaoClientes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SolicitacaoClientes" (
    id integer NOT NULL,
    cliente character varying(255) NOT NULL,
    titulo character varying(255) NOT NULL,
    categoria character varying(255) NOT NULL,
    mensagem text NOT NULL,
    status character varying(255) DEFAULT 'Aberta'::character varying NOT NULL,
    anexos json,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public."SolicitacaoClientes" OWNER TO postgres;

--
-- Name: SolicitacaoClientes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."SolicitacaoClientes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."SolicitacaoClientes_id_seq" OWNER TO postgres;

--
-- Name: SolicitacaoClientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."SolicitacaoClientes_id_seq" OWNED BY public."SolicitacaoClientes".id;


--
-- Name: Usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Usuarios" (
    id integer NOT NULL,
    nome character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    senha character varying(255) NOT NULL,
    perfil character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


ALTER TABLE public."Usuarios" OWNER TO postgres;

--
-- Name: Usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Usuarios_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Usuarios_id_seq" OWNER TO postgres;

--
-- Name: Usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Usuarios_id_seq" OWNED BY public."Usuarios".id;


--
-- Name: Clientes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Clientes" ALTER COLUMN id SET DEFAULT nextval('public."Clientes_id_seq"'::regclass);


--
-- Name: DocumentoDigitals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DocumentoDigitals" ALTER COLUMN id SET DEFAULT nextval('public."DocumentoDigitals_id_seq"'::regclass);


--
-- Name: Financeiros id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Financeiros" ALTER COLUMN id SET DEFAULT nextval('public."Financeiros_id_seq"'::regclass);


--
-- Name: Fiscals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Fiscals" ALTER COLUMN id SET DEFAULT nextval('public."Fiscals_id_seq"'::regclass);


--
-- Name: LancamentoContabils id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LancamentoContabils" ALTER COLUMN id SET DEFAULT nextval('public."LancamentoContabils_id_seq"'::regclass);


--
-- Name: PlanoConta id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PlanoConta" ALTER COLUMN id SET DEFAULT nextval('public."PlanoConta_id_seq"'::regclass);


--
-- Name: Servicos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Servicos" ALTER COLUMN id SET DEFAULT nextval('public."Servicos_id_seq"'::regclass);


--
-- Name: SolicitacaoClientes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SolicitacaoClientes" ALTER COLUMN id SET DEFAULT nextval('public."SolicitacaoClientes_id_seq"'::regclass);


--
-- Name: Usuarios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios" ALTER COLUMN id SET DEFAULT nextval('public."Usuarios_id_seq"'::regclass);


--
-- Data for Name: Clientes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Clientes" (id, nome, cpf, telefone, email, cnpj, regime, endereco, cidade, estado, observacao, anexos, "createdAt", "updatedAt") FROM stdin;
1	Multicopias Maracanã 	799.379.269-04	(41) 99634-5978	multicopias.maracana@gmail.com	24.720.040/0001-76	MEI	Rua Pasteur, 23	Colombo	PR	Senha Gov.br: 0000000	[{"nome":"Cartao CNPJ.pdf","caminho":"/uploads/1779116987701-Cartao-CNPJ.pdf"}]	2026-05-18 10:56:14.159-03	2026-05-18 12:09:53.519-03
2	Daiane Dallazzon Vitor	091.982.639-35	(41) 99822-6373	cesaradvmare@gmail.com	25.260.887/0001-88	MEI	Rua Pasteur, 23 	Colombo	PR	Senha Gov.br: Bersol23$$\nSimples Nacional: 035664898844	[]	2026-05-18 15:29:35.017-03	2026-05-18 15:29:35.017-03
\.


--
-- Data for Name: DocumentoDigitals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."DocumentoDigitals" (id, cliente, tipo, "anoCalendario", "dataEnvio", recibo, status, observacao, anexos, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Financeiros; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Financeiros" (id, descricao, cliente, tipo, valor, vencimento, status, "createdAt", "updatedAt") FROM stdin;
1	Honorários	Daiane Dallazzon Vitor	Receber	R$ 100,00	2026-05-20	Pendente	2026-05-18 15:31:48.546-03	2026-05-18 15:31:48.546-03
\.


--
-- Data for Name: Fiscals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Fiscals" (id, cliente, obrigacao, competencia, vencimento, status, valor, observacao, anexos, "createdAt", "updatedAt", "diasParaVencer", "alertaFiscal") FROM stdin;
1	Multicopias Maracanã 	DAS	05/2026	2026-05-20	Pendente	R$ 87,05		[{"nome":"DAS-PGMEI-24720040000176-05.2026 (1).pdf","caminho":"/uploads/1779124887300-DAS-PGMEI-24720040000176-05.2026-(1).pdf"}]	2026-05-18 14:21:29.667-03	2026-05-18 14:21:29.667-03	\N	\N
2	Daiane Dallazzon Vitor	DAS	05/2026	2026-05-20	Enviado	R$ 86,05	reenvio do boleto	[{"nome":"DAS-PGMEI-25260887000188-AC2026.pdf","caminho":"/uploads/1779199148429-DAS-PGMEI-25260887000188-AC2026.pdf"}]	2026-05-19 10:59:10.159-03	2026-05-19 10:59:10.159-03	0	Regularizado
\.


--
-- Data for Name: LancamentoContabils; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."LancamentoContabils" (id, cliente, data, competencia, tipo, "planoConta", descricao, valor, "formaPagamento", observacao, anexos, "createdAt", "updatedAt") FROM stdin;
1	Multicopias Maracanã 	2026-05-18	05/2026	Receita	1 - Ativo	caixa	R$ 5.000,00	Dinheiro		\N	2026-05-18 21:59:14.953-03	2026-05-18 21:59:14.953-03
2	Multicopias Maracanã 	2026-05-18	05/2026	Despesa	1 - Ativo	pagamento	R$ 1.700,00	Pix		[{"nome":"DeclaraÃ§Ã£o Amndreia.pdf","caminho":"/uploads/1779159214594-DeclaraÃ§Ã£o-Amndreia.pdf"}]	2026-05-18 21:59:53.127-03	2026-05-18 23:53:40.729-03
\.


--
-- Data for Name: PlanoConta; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PlanoConta" (id, codigo, conta, tipo, natureza, "createdAt", "updatedAt") FROM stdin;
1	1	Ativo	Sintética	Devedora	2026-05-18 20:57:39.464-03	2026-05-18 20:57:39.464-03
\.


--
-- Data for Name: Servicos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Servicos" (id, nome, categoria, prazo, valor, "createdAt", "updatedAt") FROM stdin;
1	Hororários	Financeiro	Mensal	R$ 100,00	2026-05-18 16:25:52.075-03	2026-05-18 16:25:52.075-03
\.


--
-- Data for Name: SolicitacaoClientes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SolicitacaoClientes" (id, cliente, titulo, categoria, mensagem, status, anexos, "createdAt", "updatedAt") FROM stdin;
1	Daiane Dallazzon Vitor	Envio do DAS	Fiscal	Segue DAS do mês 05/2026 para conferência e lançamento fiscal. reenvio	Aberta	[{"nome":"DAS-PGMEI-25260887000188-AC2026.pdf","caminho":"/uploads/1779195539953-DAS-PGMEI-25260887000188-AC2026.pdf"}]	2026-05-19 10:05:06.219-03	2026-05-19 10:05:06.219-03
\.


--
-- Data for Name: Usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Usuarios" (id, nome, email, senha, perfil, "createdAt", "updatedAt") FROM stdin;
1	Administrador	admin@nexa.com	$2b$10$14k.uhA2OSuwlkVg.8U/POXxDkihN8VgWTtlo4cprTy2/3VRZuc26	Administrador	2026-05-18 20:25:59.142-03	2026-05-18 20:25:59.142-03
2	Fabio Dorneles	dornelesfabio.fd@gmail.com	$2b$10$TtzktVFMtVbt1Dz5cnIrEO6kSb/gLLptHOE8neyS7khWMhdCAii3m	Administrador	2026-05-18 20:26:54.509-03	2026-05-18 20:26:54.509-03
\.


--
-- Name: Clientes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Clientes_id_seq"', 2, true);


--
-- Name: DocumentoDigitals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."DocumentoDigitals_id_seq"', 1, false);


--
-- Name: Financeiros_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Financeiros_id_seq"', 1, true);


--
-- Name: Fiscals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Fiscals_id_seq"', 2, true);


--
-- Name: LancamentoContabils_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."LancamentoContabils_id_seq"', 2, true);


--
-- Name: PlanoConta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."PlanoConta_id_seq"', 1, true);


--
-- Name: Servicos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Servicos_id_seq"', 1, true);


--
-- Name: SolicitacaoClientes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."SolicitacaoClientes_id_seq"', 1, true);


--
-- Name: Usuarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Usuarios_id_seq"', 2, true);


--
-- Name: Clientes Clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Clientes"
    ADD CONSTRAINT "Clientes_pkey" PRIMARY KEY (id);


--
-- Name: DocumentoDigitals DocumentoDigitals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DocumentoDigitals"
    ADD CONSTRAINT "DocumentoDigitals_pkey" PRIMARY KEY (id);


--
-- Name: Financeiros Financeiros_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Financeiros"
    ADD CONSTRAINT "Financeiros_pkey" PRIMARY KEY (id);


--
-- Name: Fiscals Fiscals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Fiscals"
    ADD CONSTRAINT "Fiscals_pkey" PRIMARY KEY (id);


--
-- Name: LancamentoContabils LancamentoContabils_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."LancamentoContabils"
    ADD CONSTRAINT "LancamentoContabils_pkey" PRIMARY KEY (id);


--
-- Name: PlanoConta PlanoConta_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PlanoConta"
    ADD CONSTRAINT "PlanoConta_pkey" PRIMARY KEY (id);


--
-- Name: Servicos Servicos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Servicos"
    ADD CONSTRAINT "Servicos_pkey" PRIMARY KEY (id);


--
-- Name: SolicitacaoClientes SolicitacaoClientes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SolicitacaoClientes"
    ADD CONSTRAINT "SolicitacaoClientes_pkey" PRIMARY KEY (id);


--
-- Name: Usuarios Usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key1" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key10; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key10" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key11; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key11" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key12; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key12" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key13; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key13" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key14; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key14" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key15; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key15" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key16; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key16" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key17; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key17" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key18; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key18" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key19; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key19" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key2; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key2" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key20; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key20" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key21; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key21" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key22; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key22" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key23; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key23" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key24; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key24" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key25; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key25" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key26; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key26" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key27; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key27" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key28; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key28" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key29; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key29" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key3; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key3" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key4; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key4" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key5; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key5" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key6; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key6" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key7; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key7" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key8; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key8" UNIQUE (email);


--
-- Name: Usuarios Usuarios_email_key9; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_email_key9" UNIQUE (email);


--
-- Name: Usuarios Usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Usuarios"
    ADD CONSTRAINT "Usuarios_pkey" PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--

\unrestrict 9Z7OiioKfo7HRZYDrehj5a4kWjlusXc2QmASHyOzkuNAPePIS1sjdnSWoTdoWFp

