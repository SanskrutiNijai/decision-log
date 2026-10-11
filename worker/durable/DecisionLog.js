export class DecisionLog {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
  }

  initialize() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        rationale TEXT,
        alternatives TEXT,
        owner TEXT,
        review_date TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  saveIngestion(source, decisions) {
    this.initialize();

    this.sql.exec(
      `
        INSERT INTO sources (
          id,
          title,
          content,
          created_at
        )
        VALUES (?, ?, ?, ?)
      `,
      source.id,
      source.title,
      source.content,
      source.created_at,
    );

    for (const decision of decisions) {
      this.sql.exec(
        `
          INSERT INTO decisions (
            id,
            source_id,
            summary,
            rationale,
            alternatives,
            owner,
            review_date,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        decision.id,
        source.id,
        decision.summary,
        decision.rationale,
        JSON.stringify(decision.alternatives),
        decision.owner,
        decision.review_date,
        decision.created_at,
      );
    }
  }

  saveSlackDecision(decision) {
    this.initialize();

    // Prevent duplicate approval from creating duplicate decision records.
    const existing = this.sql
      .exec(
        `
          SELECT id
          FROM decisions
          WHERE id = ?
        `,
        decision.id,
      )
      .toArray();

    if (existing.length > 0) {
      return false;
    }

    // Create a source record for the Slack message.
    this.sql.exec(
      `
        INSERT OR IGNORE INTO sources (
          id,
          title,
          content,
          created_at
        )
        VALUES (?, ?, ?, ?)
      `,
      decision.source_id,
      "Slack Decision",
      decision.slack_content || decision.summary,
      decision.created_at,
    );

    this.sql.exec(
      `
        INSERT INTO decisions (
          id,
          source_id,
          summary,
          rationale,
          alternatives,
          owner,
          review_date,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      decision.id,
      decision.source_id,
      decision.summary,
      decision.rationale,
      JSON.stringify(decision.alternatives || []),
      decision.owner,
      decision.review_date,
      decision.created_at,
    );

    return true;
  }

  getDecisions() {
    this.initialize();

    const rows = this.sql
      .exec(
        `
        SELECT
          id,
          source_id,
          summary,
          rationale,
          alternatives,
          owner,
          review_date,
          created_at
        FROM decisions
        ORDER BY created_at DESC
      `,
      )
      .toArray();

    return rows.map((row) => ({
      ...row,
      alternatives: JSON.parse(row.alternatives || "[]"),
    }));
  }

  getDecision(id) {
    this.initialize();

    const row = this.sql
      .exec(
        `
          SELECT
            id,
            source_id,
            summary,
            rationale,
            alternatives,
            owner,
            review_date,
            created_at
          FROM decisions
          WHERE id = ?
        `,
        id,
      )
      .one();

    return {
      ...row,
      alternatives: JSON.parse(row.alternatives || "[]"),
    };
  }

  getSource(id) {
    this.initialize();

    return this.sql
      .exec(
        `
          SELECT
            id,
            title,
            content,
            created_at
          FROM sources
          WHERE id = ?
        `,
        id,
      )
      .one();
  }

  deleteDecision(id) {
    this.initialize();

    const result = this.sql.exec(
      `
        DELETE FROM decisions
        WHERE id = ?
      `,
      id,
    );

    return result;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Existing ingestion workflow.
    if (url.pathname === "/ingest" && request.method === "POST") {
      const body = await request.json();

      this.saveIngestion(body.source, body.decisions);

      return Response.json({
        ok: true,
        sourceId: body.source.id,
        decisionsSaved: body.decisions.length,
      });
    }

    // Save an APPROVED Slack decision.
    if (url.pathname === "/decisions/from-slack" && request.method === "POST") {
      const body = await request.json();

      if (!body.id || !body.summary) {
        return Response.json(
          {
            error: "id and summary are required",
          },
          {
            status: 400,
          },
        );
      }

      const saved = this.saveSlackDecision(body);

      return Response.json({
        ok: true,
        saved,
        decisionId: body.id,
      });
    }

    // Get decisions.
    if (url.pathname === "/decisions" && request.method === "GET") {
      return Response.json(this.getDecisions());
    }

    // Delete decision.
    if (url.pathname.startsWith("/decisions/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();

      if (!id) {
        return Response.json(
          {
            error: "Decision ID is required",
          },
          {
            status: 400,
          },
        );
      }

      const existing = this.sql
        .exec(
          `
            SELECT id
            FROM decisions
            WHERE id = ?
          `,
          id,
        )
        .toArray();

      if (existing.length === 0) {
        return Response.json(
          {
            error: "Decision not found",
          },
          {
            status: 404,
          },
        );
      }

      this.deleteDecision(id);

      return Response.json({
        ok: true,
        deletedId: id,
      });
    }

    // Get individual decision.
    if (url.pathname.startsWith("/decisions/") && request.method === "GET") {
      const id = url.pathname.split("/").pop();

      try {
        return Response.json(this.getDecision(id));
      } catch {
        return Response.json(
          {
            error: "Decision not found",
          },
          {
            status: 404,
          },
        );
      }
    }

    // Get source.
    if (url.pathname.startsWith("/sources/") && request.method === "GET") {
      const id = url.pathname.split("/").pop();

      try {
        return Response.json(this.getSource(id));
      } catch {
        return Response.json(
          {
            error: "Source not found",
          },
          {
            status: 404,
          },
        );
      }
    }

    return new Response("Not Found", {
      status: 404,
    });
  }
}
