-- kw-backend のスキーマ（D16）。起動時にそのまま実行される冪等 DDL。
-- イベントログ（kw_run_events）が真実で、kw_runs は一覧表示用の非正規化コピー。

create table if not exists kw_users (
  name        varchar(64)  not null primary key,
  role        varchar(32)  not null,
  created_at  timestamp with time zone not null default now()
);

create table if not exists kw_resources (
  name        varchar(64)   not null primary key,
  kind        varchar(32)   not null,
  path        varchar(1024) not null,
  tags        jsonb         not null,
  created_at  timestamp with time zone not null default now()
);

create table if not exists kw_runs (
  id           varchar(32)   not null primary key,
  prompt       text          not null,
  cwd          varchar(1024) not null,
  engine       varchar(32)   not null,
  model        varchar(64),
  state        varchar(32)   not null,
  cost_usd     numeric(14,6),
  auto_approve boolean       not null default false,
  repo         varchar(64),
  branch       varchar(128),
  launched_by  varchar(64)   not null,
  created_at   timestamp with time zone not null default now()
);

-- append-only。seq は Run ごとの連番で、UI への SSE の Last-Event-ID になる
create table if not exists kw_run_events (
  run_id      varchar(32)  not null,
  seq         integer      not null,
  type        varchar(48)  not null,
  payload     jsonb        not null,
  -- kw-engine 側の seq。core 起動時の再接続（Last-Event-ID）に使う。
  -- core 自身が発行するライフサイクルイベントでは null
  engine_seq  integer,
  created_at  timestamp with time zone not null default now(),
  primary key (run_id, seq)
);
