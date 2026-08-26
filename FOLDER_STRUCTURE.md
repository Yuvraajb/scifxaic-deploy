# Folder Structure

```
.
├── .claude/
│   └── worktrees/
│       └── combine-plan/
│           ├── .claude/
│           ├── handlers/
│           └── mvp/
│               └── src/
├── classifier/
│   ├── overviews/
│   └── src/
├── docs/
│   ├── finnhub_docs/
│   ├── langchain_docs/
│   │   ├── api-reference/
│   │   │   ├── agent-connections-v2/
│   │   │   ├── auth-service-v2/
│   │   │   ├── deployments-v2/
│   │   │   ├── integrations-v1/
│   │   │   └── listeners-v2/
│   │   ├── langsmith/
│   │   │   ├── agent-server-api/
│   │   │   │   ├── a2a/
│   │   │   │   ├── assistants/
│   │   │   │   ├── crons/
│   │   │   │   ├── mcp/
│   │   │   │   ├── stateless-runs/
│   │   │   │   ├── store/
│   │   │   │   ├── streaming/
│   │   │   │   ├── system/
│   │   │   │   ├── thread-runs/
│   │   │   │   └── threads/
│   │   │   ├── fleet/
│   │   │   ├── managed-deep-agents-api/
│   │   │   │   ├── agents/
│   │   │   │   ├── mcp-servers/
│   │   │   │   ├── runs/
│   │   │   │   └── threads/
│   │   │   └── smith-api/
│   │   │       ├── access_policies/
│   │   │       ├── ace/
│   │   │       ├── alert_rules/
│   │   │       ├── annotation-queues/
│   │   │       ├── annotation_queues/
│   │   │       ├── api-key/
│   │   │       ├── audit-logs/
│   │   │       ├── auth/
│   │   │       ├── aws_marketplace/
│   │   │       ├── backfills/
│   │   │       ├── bulk-exports/
│   │   │       ├── charts/
│   │   │       ├── checkpoint/
│   │   │       ├── comments/
│   │   │       ├── commits/
│   │   │       ├── data_planes/
│   │   │       ├── datasets/
│   │   │       ├── directories/
│   │   │       ├── evaluators/
│   │   │       ├── examples/
│   │   │       ├── execute/
│   │   │       ├── experiment-view-overrides/
│   │   │       ├── experiments/
│   │   │       ├── features/
│   │   │       ├── feedback/
│   │   │       ├── feedback-configs/
│   │   │       ├── files/
│   │   │       ├── gateway-policies/
│   │   │       ├── hub_environments/
│   │   │       ├── info/
│   │   │       ├── integrations/
│   │   │       ├── issues/
│   │   │       ├── issues-agent/
│   │   │       ├── likes/
│   │   │       ├── mcp/
│   │   │       ├── mcp_vendors/
│   │   │       ├── me/
│   │   │       ├── model-price-map/
│   │   │       ├── oauth/
│   │   │       ├── optimization-jobs/
│   │   │       ├── organizations/
│   │   │       ├── orgs/
│   │   │       ├── ownerships/
│   │   │       ├── playground-settings/
│   │   │       ├── prompt-webhooks/
│   │   │       ├── prompts/
│   │   │       ├── public/
│   │   │       ├── repos/
│   │   │       ├── run/
│   │   │       ├── runs/
│   │   │       ├── sandboxes/
│   │   │       ├── scim-tokens/
│   │   │       ├── service-accounts/
│   │   │       ├── sessions/
│   │   │       ├── settings/
│   │   │       ├── tag-transitions/
│   │   │       ├── tags/
│   │   │       ├── tenant/
│   │   │       ├── threads/
│   │   │       ├── tools/
│   │   │       ├── tracer-sessions/
│   │   │       ├── ttl-settings/
│   │   │       ├── usage-limits/
│   │   │       └── workspaces/
│   │   └── oss/
│   │       ├── javascript/
│   │       │   ├── concepts/
│   │       │   ├── contributing/
│   │       │   ├── deepagents/
│   │       │   │   ├── code/
│   │       │   │   └── frontend/
│   │       │   ├── integrations/
│   │       │   │   ├── chat/
│   │       │   │   ├── embeddings/
│   │       │   │   ├── providers/
│   │       │   │   └── tools/
│   │       │   ├── langchain/
│   │       │   │   ├── frontend/
│   │       │   │   │   └── integrations/
│   │       │   │   ├── middleware/
│   │       │   │   ├── multi-agent/
│   │       │   │   └── test/
│   │       │   ├── langgraph/
│   │       │   │   └── frontend/
│   │       │   ├── migrate/
│   │       │   ├── reference/
│   │       │   └── releases/
│   │       └── python/
│   │           ├── concepts/
│   │           ├── contributing/
│   │           ├── deepagents/
│   │           │   ├── code/
│   │           │   └── frontend/
│   │           ├── integrations/
│   │           │   └── providers/
│   │           ├── langchain/
│   │           │   ├── frontend/
│   │           │   │   └── integrations/
│   │           │   ├── middleware/
│   │           │   ├── multi-agent/
│   │           │   └── test/
│   │           ├── langgraph/
│   │           │   └── frontend/
│   │           ├── migrate/
│   │           ├── reference/
│   │           └── releases/
│   ├── markdown_docs_build/
│   ├── render_docs/
│   ├── slack_docs/
│   └── supabase_docs/
│       ├── guides/
│       │   ├── ai/
│       │   │   ├── examples/
│       │   │   ├── integrations/
│       │   │   ├── quickstarts/
│       │   │   └── vector-indexes/
│       │   ├── ai-tools/
│       │   ├── api/
│       │   │   └── rest/
│       │   ├── auth/
│       │   │   ├── auth-hooks/
│       │   │   ├── auth-mfa/
│       │   │   ├── debugging/
│       │   │   ├── enterprise-sso/
│       │   │   ├── oauth-server/
│       │   │   ├── quickstarts/
│       │   │   ├── server-side/
│       │   │   ├── sessions/
│       │   │   ├── social-login/
│       │   │   └── third-party/
│       │   ├── cron/
│       │   ├── database/
│       │   │   ├── connecting-to-postgres/
│       │   │   ├── extensions/
│       │   │   │   └── wrappers/
│       │   │   ├── postgres/
│       │   │   ├── prisma/
│       │   │   └── replication/
│       │   ├── deployment/
│       │   │   └── branching/
│       │   ├── functions/
│       │   │   └── examples/
│       │   ├── getting-started/
│       │   │   ├── quickstarts/
│       │   │   └── tutorials/
│       │   ├── integrations/
│       │   ├── local-development/
│       │   │   ├── cli/
│       │   │   └── testing/
│       │   ├── platform/
│       │   │   ├── aws-marketplace/
│       │   │   ├── manage-your-usage/
│       │   │   ├── mfa/
│       │   │   ├── migrating-to-supabase/
│       │   │   ├── migrating-within-supabase/
│       │   │   ├── read-replicas/
│       │   │   └── sso/
│       │   ├── queues/
│       │   ├── realtime/
│       │   ├── resources/
│       │   ├── security/
│       │   ├── self-hosting/
│       │   ├── storage/
│       │   │   ├── analytics/
│       │   │   │   └── examples/
│       │   │   ├── buckets/
│       │   │   ├── cdn/
│       │   │   ├── debugging/
│       │   │   ├── management/
│       │   │   ├── production/
│       │   │   ├── s3/
│       │   │   ├── schema/
│       │   │   ├── security/
│       │   │   ├── serving/
│       │   │   ├── uploads/
│       │   │   └── vector/
│       │   ├── telemetry/
│       │   │   └── metrics/
│       │   └── troubleshooting/
│       └── reference/
│           ├── api/
│           ├── cli/
│           ├── csharp/
│           │   └── v0/
│           ├── dart/
│           │   └── v1/
│           ├── javascript/
│           │   └── v1/
│           ├── kotlin/
│           │   ├── v1/
│           │   └── v2/
│           ├── python/
│           ├── self-hosting-analytics/
│           ├── self-hosting-auth/
│           ├── self-hosting-functions/
│           ├── self-hosting-realtime/
│           ├── self-hosting-storage/
│           └── swift/
│               └── v1/
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── lib/
│       ├── pages/
│       ├── store/
│       └── types/
├── handlers/
├── migrations/
├── overviews/
├── public/
├── slack-bot/
└── supabase/
    ├── .temp/
    └── migrations/
```
