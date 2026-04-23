import { expect, test, type Page } from "@playwright/test";

test("dashboard renders through the operator BFF with insights", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible();
  await expect(page.getByText("BarraVips")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Números do momento", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fila de prioridade", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Para resolver agora", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Transferências nos últimos 7 dias", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tipo ainda indefinido/ })).toBeVisible();
  await expect(page.getByText("Horários nos próximos 14 dias")).toBeVisible();

  await page.waitForLoadState("networkidle");

  expect(requests.some((url) => url.includes("/api/operator/conversations"))).toBe(true);
  expect(requests.some((url) => url.includes("/api/operator/dashboard/queues"))).toBe(true);
  expect(requests.some((url) => url.includes("/api/operator/receipts"))).toBe(true);
  expect(requests.some((url) => url.includes("/api/operator/handoffs/summary"))).toBe(true);
  expect(requests.some((url) => url.includes("/api/operator/models/active"))).toBe(true);
  expect(requests.filter(isApiRequest).every((url) => new URL(url).pathname.startsWith("/api/operator/"))).toBe(true);
  expect(requests.some(isDirectBackendRequest)).toBe(false);
  expect(await page.content()).not.toContain("dev-operator-api-key");
});

test("dashboard handles empty BFF states", async ({ page }) => {
  await mockDashboardBff(page, "empty");

  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Números do momento", exact: true })).toBeVisible();
  await expect(page.getByText("Nenhuma conversa precisando de atenção agora.")).toBeVisible();
  await expect(page.getByText("Nenhum comprovante aguardando conferência.")).toBeVisible();
  await expect(page.getByText("Nenhuma conversa registrada ainda.")).toBeVisible();
  await expect(page.getByText("Nenhuma mídia pendente.")).toBeVisible();
  await expect(page.getByText("Nenhuma modelo cadastrada.")).toBeVisible();
});

test("dashboard handles BFF error states", async ({ page }) => {
  await mockDashboardBff(page, "conversation-error");

  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Números do momento", exact: true })).toBeVisible();
  await expect(page.getByText("Não consegui montar o resumo completo.")).toBeVisible();
  await expect(page.getByText("Falha controlada em conversas").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Como estão as conversas", exact: true })).toBeVisible();
});

test("dashboard sample data fits desktop and mobile", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });
  await mockDashboardBff(page, "sample");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Números do momento", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fila de prioridade", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Para resolver agora", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agenda dos próximos 14 dias", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Como estão as conversas", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mídias", exact: true })).toBeVisible();
    await expect(page.getByText("Com erro de sincronização")).toBeVisible();
    await expect(page.getByText("Mídias aguardando aprovação").first()).toBeVisible();
    await expect(page.getByText("Comprovantes para conferir").first()).toBeVisible();
    await expect(page.getByText("precisa conferir").first()).toBeVisible();
    await expect(page.getByText("Cliente aguardando resposta").first()).toBeVisible();
    await expect(page.getByText("aguarda resposta").first()).toBeVisible();
    await expect(page.getByText("urgência imediata").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  expect(requests.filter(isApiRequest).every((url) => new URL(url).pathname.startsWith("/api/operator/"))).toBe(true);
});

test("status page renders and hits the status BFF endpoints", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Status do sistema", exact: true })).toBeVisible();

  await page.waitForLoadState("networkidle");

  expect(requests.some((url) => url.includes("/api/operator/status/health"))).toBe(true);
  expect(requests.some((url) => url.includes("/api/operator/status/evolution"))).toBe(true);
  expect(requests.some((url) => url.includes("/api/operator/status/calendar"))).toBe(true);
  expect(requests.some((url) => url.includes("/api/operator/status/agent"))).toBe(true);
  expect(requests.some(isDirectBackendRequest)).toBe(false);
  expect(await page.content()).not.toContain("dev-operator-api-key");
});

test("operator shell stays usable on mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible();
  await expect(page.getByLabel("Menu principal")).toBeVisible();

  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Status do sistema", exact: true })).toBeVisible();
  await expect(page.getByLabel("Menu principal")).toBeVisible();

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
});

test("midias usage summary fits desktop and mobile", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });
  await mockMediaBff(page);

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/midias");
    await expect(page.getByRole("heading", { name: "Resumo da semana", exact: true })).toBeVisible();
    await expect(page.getByText("Aguardando aprovação").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Sem categoria/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mais enviadas aos clientes", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mídias que falharam ao enviar", exact: true })).toBeVisible();
    await expect(page.locator("#media-40000000-0000-0000-0000-0000000000a1")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  expect(requests.some((url) => url.includes("/api/operator/media/usage-summary"))).toBe(true);
  expect(requests.filter(isApiRequest).every((url) => new URL(url).pathname.startsWith("/api/operator/"))).toBe(true);
});

test("main operator routes render inside the shell", async ({ page }) => {
  const routes = [
    ["/", "Visão geral"],
    ["/dashboard", "Visão geral"],
    ["/conversas", "Conversas"],
    ["/handoffs", "Transferências"],
    ["/agenda", "Agenda"],
    ["/midias", "Fotos e mídias"],
    ["/modelos", "Minha modelo"],
    ["/status", "Status do sistema"],
  ] as const;

  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByLabel("Menu principal")).toBeVisible();
  }
});

function isDirectBackendRequest(url: string): boolean {
  const parsed = new URL(url);
  return parsed.port === "8000" || parsed.pathname.startsWith("/api/status/");
}

function isApiRequest(url: string): boolean {
  return new URL(url).pathname.startsWith("/api/");
}

async function mockDashboardBff(
  page: Page,
  mode: "empty" | "conversation-error" | "sample",
) {
  const sample = sampleDashboardData();
  await page.route(/\/api\/operator\//, async (route) => {
    const url = new URL(route.request().url());
    const handoff = url.searchParams.get("handoff_status");

    if (url.pathname === "/api/operator/dashboard/summary") {
      if (mode === "conversation-error") {
        await route.fulfill({
          status: 500,
          json: { error: { status: 500, message: "Falha controlada no resumo agregado" } },
        });
        return;
      }
      await route.fulfill({ json: mode === "sample" ? sample.summary : emptySummary() });
      return;
    }
    if (url.pathname === "/api/operator/handoffs/summary") {
      await route.fulfill({ json: mode === "sample" ? sample.handoffSummary : emptyHandoffSummary() });
      return;
    }
    if (url.pathname === "/api/operator/dashboard/queues") {
      await route.fulfill({ json: mode === "sample" ? envelope(sample.queues, sample.queues.length) : envelope([]) });
      return;
    }
    if (url.pathname === "/api/operator/conversations" && handoff === "OPENED") {
      await route.fulfill({ json: mode === "sample" ? envelope(sample.opened, 1) : envelope([]) });
      return;
    }
    if (url.pathname === "/api/operator/conversations" && handoff === "ACKNOWLEDGED") {
      await route.fulfill({
        json: mode === "sample" ? envelope(sample.acknowledged, 1) : envelope([]),
      });
      return;
    }
    if (url.pathname === "/api/operator/conversations") {
      if (mode === "conversation-error") {
        await route.fulfill({
          status: 500,
          json: { error: { status: 500, message: "Falha controlada em conversas" } },
        });
        return;
      }
      await route.fulfill({ json: mode === "sample" ? envelope(sample.conversations, 17) : envelope([]) });
      return;
    }
    if (url.pathname === "/api/operator/schedule/slots") {
      await route.fulfill({ json: mode === "sample" ? envelope(sample.slots, 3) : envelope([]) });
      return;
    }
    if (url.pathname === "/api/operator/media") {
      await route.fulfill({ json: mode === "sample" ? envelope(sample.media, 2) : envelope([]) });
      return;
    }
    if (url.pathname === "/api/operator/receipts") {
      await route.fulfill({ json: mode === "sample" ? envelope(sample.receipts, 1) : envelope([]) });
      return;
    }
    if (url.pathname === "/api/operator/models/active") {
      if (mode === "sample") {
        await route.fulfill({ json: sample.model });
        return;
      }
      await route.fulfill({
        status: 404,
        json: { error: { status: 404, message: "Nenhuma modelo ativa" } },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { status: 404, message: "Nao mockado" } } });
  });
}

async function mockMediaBff(page: Page) {
  const now = "2026-04-22T12:00:00.000Z";
  const media = [
    {
      id: "40000000-0000-0000-0000-0000000000a1",
      model_id: "10000000-0000-0000-0000-0000000000aa",
      media_type: "image",
      category: null,
      approval_status: "PENDING",
      send_constraints_json: {},
      metadata_json: {},
      created_at: "2026-04-20T12:00:00.000Z",
      updated_at: now,
    },
    {
      id: "40000000-0000-0000-0000-0000000000a2",
      model_id: "10000000-0000-0000-0000-0000000000aa",
      media_type: "video",
      category: "portfolio",
      approval_status: "APPROVED",
      send_constraints_json: {},
      metadata_json: {},
      created_at: "2026-04-20T12:00:00.000Z",
      updated_at: now,
    },
  ];
  await page.route(/\/api\/operator\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/operator/media/usage-summary") {
      await route.fulfill({ json: mediaUsageSummary() });
      return;
    }
    if (url.pathname === "/api/operator/media") {
      await route.fulfill({ json: envelope(media, media.length) });
      return;
    }
    if (url.pathname.startsWith("/api/operator/media/") && url.pathname.endsWith("/content")) {
      await route.fulfill({
        status: 404,
        json: { error: { status: 404, message: "Conteudo mockado ausente" } },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { status: 404, message: "Nao mockado" } } });
  });
}

function envelope<T>(items: T[], total = items.length) {
  return {
    items,
    total,
    page: 1,
    page_size: 100,
  };
}

function mediaUsageSummary() {
  const now = "2026-04-22T12:00:00.000Z";
  const requestedStart = "2026-04-15T12:00:00.000Z";
  const meta = (source: string, window: string, sampleSize: number) => ({
    source,
    window,
    sample_method: "full_aggregate",
    sample_size: sampleSize,
  });
  const rankItem = (count: number) => ({
    media_id: "40000000-0000-0000-0000-0000000000a1",
    media_type: "image",
    category: null,
    approval_status: "PENDING",
    count,
    drilldown_href: "/midias#media-40000000-0000-0000-0000-0000000000a1",
  });
  return {
    generated_at: now,
    requested_window: "7d",
    delivery_status_available: true,
    windows: {
      requested: { key: "requested", label: "7d", starts_at: requestedStart, ends_at: now },
      all_time: { key: "all_time", label: "all_time", starts_at: null, ends_at: null },
    },
    pending: {
      value: 1,
      meta: meta("app.media_assets.approval_status", "all_time", 2),
    },
    without_category: {
      value: 1,
      meta: meta("app.media_assets.category", "all_time", 2),
    },
    approved_by_category: {
      counts: { portfolio: 1 },
      meta: meta("app.media_assets.approval_status + app.media_assets.category", "all_time", 1),
    },
    most_used: {
      items: [rankItem(4)],
      meta: meta("app.messages.media_id + app.messages.provider_message_at/created_at", "requested", 5),
    },
    send_failures: {
      items: [rankItem(1)],
      meta: meta(
        "app.messages.media_id + app.messages.delivery_status + app.messages.provider_message_at/created_at",
        "requested",
        3,
      ),
    },
  };
}

function emptySummary() {
  const now = "2026-04-22T12:00:00.000Z";
  return dashboardSummary({
    generatedAt: now,
    requestedStart: "2026-04-21T12:00:00.000Z",
    requestedEnd: now,
    todayStart: "2026-04-22T00:00:00.000Z",
    todayEnd: "2026-04-23T00:00:00.000Z",
    next14Start: now,
    next14End: "2026-05-06T12:00:00.000Z",
    totalConversations: 0,
    activeConversations: 0,
    newConversationsToday: 0,
    stateCounts: {},
    flowCounts: {},
    handoffCounts: {},
    mediaPending: 0,
    mediaWithoutCategory: 0,
    totalMedia: 0,
    scheduleCounts: {},
    calendarSyncPending: 0,
    calendarSyncError: 0,
    totalScheduleSlots: 0,
  });
}

function emptyHandoffSummary() {
  const now = "2026-04-22T12:00:00.000Z";
  return handoffSummary({
    generatedAt: now,
    requestedStart: "2026-04-15T12:00:00.000Z",
    requestedEnd: now,
    currentCounts: {},
    ageCounts: {},
    reasons: {},
    totalConversations: 0,
    openSampleSize: 0,
    reasonSampleSize: 0,
    ackAverage: null,
    releaseAverage: null,
  });
}

function sampleDashboardData() {
  const now = new Date("2026-04-22T12:00:00.000Z").getTime();
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const future = (minutesAhead: number) => new Date(now + minutesAhead * 60_000).toISOString();
  const conversation = (
    id: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) => ({
    id,
    client: {
      id: `client-${id}`,
      display_name: `Cliente ${id}`,
      whatsapp_jid: `55219999${id}@s.whatsapp.net`,
      client_status: "NEW",
      profile_summary: "Perfil de exemplo sem dados reais.",
      language_hint: "pt-BR",
    },
    model: { id: "model-1", display_name: "Modelo ativa" },
    state: "NOVO",
    flow_type: "INTERNAL",
    handoff_status: "NONE",
    pending_action: null,
    awaiting_input_type: null,
    summary: null,
    awaiting_client_decision: false,
    urgency_profile: null,
    expected_amount: null,
    last_handoff_at: null,
    last_message: {
      direction: "INBOUND",
      message_type: "text",
      content_preview: "Mensagem recente do cliente",
      created_at: iso(8),
      delivery_status: null,
    },
    last_message_at: iso(8),
    ...overrides,
  });
  const queueItem = (
    queueKey: string,
    conversationId: string,
    minutesAgo: number,
    overrides: Partial<Record<string, unknown>> = {},
  ) => ({
    queue_key: queueKey,
    queue_label:
      queueKey === "OPEN_HANDOFF"
        ? "Handoffs abertos"
        : queueKey === "CLIENT_WAITING_RESPONSE"
          ? "Cliente esperando resposta"
          : "Aguardando decisao do cliente",
    queue_priority:
      queueKey === "OPEN_HANDOFF" ? 10 : queueKey === "CLIENT_WAITING_RESPONSE" ? 30 : 70,
    conversation_id: conversationId,
    client_display_name: `Cliente ${conversationId}`,
    client_identifier: `55219999${conversationId}@s.whatsapp.net`,
    state: "NEGOCIANDO",
    flow_type: "INTERNAL",
    handoff_status: "NONE",
    relevant_at: iso(minutesAgo),
    age_seconds: minutesAgo * 60,
    age_source: "app.messages.direction",
    reason: "Ultimo inbound nao tem outbound posterior registrado.",
    drilldown_href: `/conversas/${conversationId}`,
    source: "app.messages.direction + provider_message_at/created_at",
    window: "latest_inbound_without_later_outbound",
    sample_size: 17,
    ...overrides,
  });

  const data = {
    queues: [
      queueItem("OPEN_HANDOFF", "004", 50, {
        queue_label: "Handoffs abertos",
        flow_type: "EXTERNAL",
        handoff_status: "OPENED",
        age_source: "app.conversations.last_handoff_at",
        reason: "Handoff aberto aguardando reconhecimento ou liberacao.",
        source: "app.conversations + app.handoff_events",
        window: "all_time",
      }),
      queueItem("CLIENT_WAITING_RESPONSE", "001", 185),
      queueItem("AWAITING_CLIENT_DECISION", "001", 185, {
        queue_label: "Aguardando decisao do cliente",
        queue_priority: 70,
        age_source: "app.conversations.last_message_at",
        reason: "Conversa marcada com awaiting_client_decision=true.",
        source: "app.conversations.awaiting_client_decision",
        window: "all_time",
      }),
    ],
    conversations: [
      conversation("001", {
        state: "NEGOCIANDO",
        flow_type: "UNDETERMINED",
        summary: "Cliente avaliando horario e valor.",
        awaiting_client_decision: true,
        urgency_profile: "IMMEDIATE",
        expected_amount: "750.00",
        last_message_at: iso(185),
      }),
      conversation("002", { state: "QUALIFICANDO", flow_type: "UNDETERMINED", last_message_at: iso(55) }),
      conversation("003", { state: "CONFIRMADO", flow_type: "INTERNAL", last_message_at: iso(15) }),
      conversation("004", {
        state: "ESCALADO",
        flow_type: "EXTERNAL",
        handoff_status: "OPENED",
        last_handoff_at: iso(50),
        last_message_at: iso(45),
      }),
    ],
    opened: [
      conversation("004", {
        state: "ESCALADO",
        flow_type: "EXTERNAL",
        handoff_status: "OPENED",
        last_handoff_at: iso(50),
        last_message_at: iso(45),
      }),
    ],
    acknowledged: [
      conversation("005", {
        state: "ESCALADO",
        flow_type: "INTERNAL",
        handoff_status: "ACKNOWLEDGED",
        last_handoff_at: iso(25),
        last_message_at: iso(20),
      }),
    ],
    slots: [
      {
        id: "slot-1",
        model_id: "model-1",
        starts_at: future(60),
        ends_at: future(120),
        status: "CONFIRMED",
        source: "MANUAL",
        external_event_id: null,
        calendar_sync_status: "SYNCED",
        last_synced_at: iso(5),
        last_sync_error: null,
      },
      {
        id: "slot-2",
        model_id: "model-1",
        starts_at: future(180),
        ends_at: future(240),
        status: "BLOCKED",
        source: "MANUAL",
        external_event_id: null,
        calendar_sync_status: "ERROR",
        last_synced_at: null,
        last_sync_error: "calendar timeout",
      },
      {
        id: "slot-3",
        model_id: "model-1",
        starts_at: future(300),
        ends_at: future(360),
        status: "HELD",
        source: "AUTO_BLOCK",
        external_event_id: null,
        calendar_sync_status: "PENDING",
        last_synced_at: null,
        last_sync_error: null,
      },
    ],
    media: [
      {
        id: "media-1",
        model_id: "model-1",
        media_type: "image",
        category: null,
        approval_status: "PENDING",
        send_constraints_json: {},
        metadata_json: {},
        created_at: iso(200),
        updated_at: iso(30),
      },
      {
        id: "media-2",
        model_id: "model-1",
        media_type: "video",
        category: "portfolio",
        approval_status: "APPROVED",
        send_constraints_json: {},
        metadata_json: {},
        created_at: iso(300),
        updated_at: iso(40),
      },
    ],
    receipts: [
      {
        id: "receipt-1",
        conversation_id: "004",
        client: {
          id: "client-004",
          display_name: "Cliente 004",
          whatsapp_jid: "55219999004@s.whatsapp.net",
          client_status: "NEW",
          profile_summary: "Perfil de exemplo sem dados reais.",
          language_hint: "pt-BR",
        },
        model: { id: "model-1", display_name: "Modelo ativa" },
        message_id: "message-receipt-1",
        detected_amount: "720.00",
        expected_amount: "750.00",
        analysis_status: "UNCERTAIN",
        tolerance_applied: "10.00",
        needs_review: true,
        metadata_json: {},
        drilldown_href: "/conversas/004",
        created_at: iso(25),
        updated_at: iso(20),
      },
    ],
    model: {
      id: "model-1",
      display_name: "Modelo ativa",
      is_active: true,
      persona_json: { tom: "PENDING_DECISION" },
      services_json: {},
      pricing_json: {},
      languages: [],
      calendar_external_id: null,
      created_at: iso(500),
      updated_at: iso(20),
    },
  };
  return {
    ...data,
    summary: dashboardSummary({
      generatedAt: new Date(now).toISOString(),
      requestedStart: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      requestedEnd: new Date(now).toISOString(),
      todayStart: "2026-04-22T00:00:00.000Z",
      todayEnd: "2026-04-23T00:00:00.000Z",
      next14Start: new Date(now).toISOString(),
      next14End: new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(),
      totalConversations: 17,
      activeConversations: 9,
      newConversationsToday: 3,
      stateCounts: { NOVO: 2, QUALIFICANDO: 4, NEGOCIANDO: 5, CONFIRMADO: 3, ESCALADO: 3 },
      flowCounts: { UNDETERMINED: 6, INTERNAL: 8, EXTERNAL: 3 },
      handoffCounts: { NONE: 14, OPENED: 1, ACKNOWLEDGED: 1, RELEASED: 1 },
      mediaPending: 2,
      mediaWithoutCategory: 1,
      totalMedia: 12,
      scheduleCounts: { AVAILABLE: 0, BLOCKED: 1, HELD: 1, CONFIRMED: 1, CANCELLED: 0 },
      calendarSyncPending: 1,
      calendarSyncError: 1,
      totalScheduleSlots: 3,
    }),
    handoffSummary: handoffSummary({
      generatedAt: new Date(now).toISOString(),
      requestedStart: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      requestedEnd: new Date(now).toISOString(),
      currentCounts: { NONE: 14, OPENED: 1, ACKNOWLEDGED: 1, RELEASED: 1 },
      ageCounts: { "0-15m": 0, "15-30m": 1, "30-60m": 1, "1-4h": 0, "4h+": 0, UNKNOWN: 0 },
      reasons: { external_flow: 1, SEM_MOTIVO: 1 },
      totalConversations: 17,
      openSampleSize: 2,
      reasonSampleSize: 2,
      ackAverage: 1500,
      releaseAverage: 3600,
    }),
  };
}

function dashboardSummary(input: {
  generatedAt: string;
  requestedStart: string;
  requestedEnd: string;
  todayStart: string;
  todayEnd: string;
  next14Start: string;
  next14End: string;
  totalConversations: number;
  activeConversations: number;
  newConversationsToday: number;
  stateCounts: Record<string, number>;
  flowCounts: Record<string, number>;
  handoffCounts: Record<string, number>;
  mediaPending: number;
  mediaWithoutCategory: number;
  totalMedia: number;
  scheduleCounts: Record<string, number>;
  calendarSyncPending: number;
  calendarSyncError: number;
  totalScheduleSlots: number;
}) {
  const countMetric = (value: number, source: string, window: string, sampleSize: number) => ({
    value,
    meta: { source, window, sample_method: "full_aggregate", sample_size: sampleSize },
  });
  const breakdownMetric = (
    counts: Record<string, number>,
    source: string,
    window: string,
    sampleSize: number,
  ) => ({
    counts,
    meta: { source, window, sample_method: "full_aggregate", sample_size: sampleSize },
  });
  return {
    generated_at: input.generatedAt,
    requested_window: "24h",
    windows: {
      requested: { key: "requested", label: "24h", starts_at: input.requestedStart, ends_at: input.requestedEnd },
      today: { key: "today", label: "today", starts_at: input.todayStart, ends_at: input.todayEnd },
      next_14_days: { key: "next_14_days", label: "next_14_days", starts_at: input.next14Start, ends_at: input.next14End },
      all_time: { key: "all_time", label: "all_time", starts_at: null, ends_at: null },
    },
    total_conversations: countMetric(input.totalConversations, "app.conversations.id", "all_time", input.totalConversations),
    active_conversations: countMetric(input.activeConversations, "app.conversations.last_message_at", "requested", input.totalConversations),
    new_conversations_today: countMetric(input.newConversationsToday, "app.conversations.created_at", "today", input.totalConversations),
    conversations_by_state: breakdownMetric(input.stateCounts, "app.conversations.state", "all_time", input.totalConversations),
    conversations_by_flow_type: breakdownMetric(input.flowCounts, "app.conversations.flow_type", "all_time", input.totalConversations),
    conversations_by_handoff_status: breakdownMetric(input.handoffCounts, "app.conversations.handoff_status", "all_time", input.totalConversations),
    handoffs_opened: countMetric(input.handoffCounts.OPENED ?? 0, "app.conversations.handoff_status", "all_time", input.totalConversations),
    handoffs_acknowledged: countMetric(input.handoffCounts.ACKNOWLEDGED ?? 0, "app.conversations.handoff_status", "all_time", input.totalConversations),
    media_pending: countMetric(input.mediaPending, "app.media_assets.approval_status", "all_time", input.totalMedia),
    media_without_category: countMetric(input.mediaWithoutCategory, "app.media_assets.category", "all_time", input.totalMedia),
    schedule_slots_next_14d_total: countMetric(input.totalScheduleSlots, "app.schedule_slots.starts_at", "next_14_days", input.totalScheduleSlots),
    schedule_slots_next_14d_by_status: breakdownMetric(input.scheduleCounts, "app.schedule_slots.status", "next_14_days", input.totalScheduleSlots),
    calendar_sync_pending: countMetric(input.calendarSyncPending, "app.schedule_slots.calendar_sync_status", "all_time", input.totalScheduleSlots),
    calendar_sync_error: countMetric(input.calendarSyncError, "app.schedule_slots.calendar_sync_status", "all_time", input.totalScheduleSlots),
  };
}

function handoffSummary(input: {
  generatedAt: string;
  requestedStart: string;
  requestedEnd: string;
  currentCounts: Record<string, number>;
  ageCounts: Record<string, number>;
  reasons: Record<string, number>;
  totalConversations: number;
  openSampleSize: number;
  reasonSampleSize: number;
  ackAverage: number | null;
  releaseAverage: number | null;
}) {
  const breakdownMetric = (
    counts: Record<string, number>,
    source: string,
    window: string,
    sampleSize: number,
  ) => ({
    counts,
    meta: { source, window, sample_method: "full_aggregate", sample_size: sampleSize },
  });
  const durationMetric = (average: number | null, source: string, sampleSize: number) =>
    average === null
      ? null
      : {
          average_seconds: average,
          min_seconds: average,
          max_seconds: average,
          meta: { source, window: "requested", sample_method: "full_aggregate", sample_size: sampleSize },
        };
  return {
    generated_at: input.generatedAt,
    requested_window: "7d",
    windows: {
      requested: { key: "requested", label: "7d", starts_at: input.requestedStart, ends_at: input.requestedEnd },
      all_time: { key: "all_time", label: "all_time", starts_at: null, ends_at: null },
    },
    current_by_status: breakdownMetric(input.currentCounts, "app.conversations.handoff_status", "all_time", input.totalConversations),
    open_age_buckets: breakdownMetric(
      input.ageCounts,
      "app.handoff_events.created_at latest handoff_opened; UNKNOWN when missing",
      "all_time",
      input.openSampleSize,
    ),
    reasons: breakdownMetric(input.reasons, "app.handoff_events.reason", "requested", input.reasonSampleSize),
    time_to_acknowledge: durationMetric(
      input.ackAverage,
      "app.handoff_events.created_at:handoff_opened->handoff_acknowledged",
      input.ackAverage === null ? 0 : 1,
    ),
    time_to_release: durationMetric(
      input.releaseAverage,
      "app.handoff_events.created_at:handoff_opened->handoff_released",
      input.releaseAverage === null ? 0 : 1,
    ),
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflowing = await page.evaluate(() => {
    const selectors = [
      ".metric",
      ".attention-list",
      ".attention-item",
      ".queue-item",
      ".bar-row",
      ".link-pill",
      ".badge",
      ".data-table td",
      ".data-table th",
    ];
    return Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")))
      .filter((element) => element.scrollWidth > element.clientWidth + 2)
      .map((element) => ({
        className: element.className,
        text: element.textContent?.trim().slice(0, 80),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
  });
  expect(overflowing).toEqual([]);
}
