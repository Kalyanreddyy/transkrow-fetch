import assert from "node:assert/strict";
import test from "node:test";
import { isSameOrigin } from "../src/lib/http";

const ENV_KEYS = ["RENDER_EXTERNAL_HOSTNAME", "PUBLIC_URL", "RENDER_EXTERNAL_URL"] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => void) {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const prior = previous.get(key);
      if (prior === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior;
      }
    }
  }
}

function loginRequest(headers: Record<string, string>): Request {
  return new Request("http://srv-internal:10000/api/auth/login", { method: "POST", headers });
}

test("allows a request with no Origin header", () => {
  withEnv({}, () => {
    assert.equal(isSameOrigin(loginRequest({ host: "srv-internal:10000" })), true);
  });
});

test("allows a browser Origin that matches Host", () => {
  withEnv({}, () => {
    const request = loginRequest({
      host: "transkrow-fetch.onrender.com",
      origin: "https://transkrow-fetch.onrender.com",
    });
    assert.equal(isSameOrigin(request), true);
  });
});

test("blocks a browser Origin when the proxy Host does not match", () => {
  withEnv({}, () => {
    const request = loginRequest({
      host: "srv-internal:10000",
      origin: "https://transkrow-fetch.onrender.com",
    });
    assert.equal(isSameOrigin(request), false);
  });
});

test("accepts RENDER_EXTERNAL_HOSTNAME when the proxy Host differs from Origin", () => {
  withEnv({ RENDER_EXTERNAL_HOSTNAME: "transkrow-fetch.onrender.com" }, () => {
    const request = loginRequest({
      host: "srv-internal:10000",
      origin: "https://Transkrow-Fetch.onrender.com",
    });
    assert.equal(isSameOrigin(request), true);
  });
});

test("accepts the host from PUBLIC_URL and RENDER_EXTERNAL_URL", () => {
  withEnv({ PUBLIC_URL: "https://fetch.example.com" }, () => {
    assert.equal(
      isSameOrigin(loginRequest({ host: "srv-internal:10000", origin: "https://fetch.example.com" })),
      true,
    );
  });
  withEnv({ RENDER_EXTERNAL_URL: "https://transkrow-fetch.onrender.com" }, () => {
    assert.equal(
      isSameOrigin(
        loginRequest({ host: "srv-internal:10000", origin: "https://transkrow-fetch.onrender.com" }),
      ),
      true,
    );
  });
});

test("accepts the first x-forwarded-host when Host is internal", () => {
  withEnv({}, () => {
    const request = loginRequest({
      host: "srv-internal:10000",
      "x-forwarded-host": "transkrow-fetch.onrender.com, proxy.internal",
      origin: "https://transkrow-fetch.onrender.com",
    });
    assert.equal(isSameOrigin(request), true);
  });
});

test("still blocks a foreign Origin when RENDER_EXTERNAL_HOSTNAME is set", () => {
  withEnv({ RENDER_EXTERNAL_HOSTNAME: "transkrow-fetch.onrender.com" }, () => {
    const request = loginRequest({
      host: "srv-internal:10000",
      origin: "https://evil.example",
    });
    assert.equal(isSameOrigin(request), false);
    assert.equal(isSameOrigin(loginRequest({ host: "srv-internal:10000", origin: "not a url" })), false);
  });
});
