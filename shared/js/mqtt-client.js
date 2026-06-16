/**
 * Shared MQTT helpers for Nanoportal admin, bigscreen, and smallscreen.
 * Requires mqtt.min.js (MQTT.js 5.x) loaded first.
 * Non-retained: session/control, session/group_contact, bigscreen/video/play|pause|reset, smallscreen/quiz/result
 */
(function (global) {
  const LS_BROKER_KEY = "nanoportal.mqtt.broker";

  const RETAIN_TOPIC_LIST = [
    "bigscreen/layer",
    "bigscreen/photo",
    "bigscreen/video",
    "bigscreen/players",
    "bigscreen/celebration/background",
    "bigscreen/celebration/cheer",
    "smallscreen/layer",
    "smallscreen/photo",
    "smallscreen/video",
    "smallscreen/quiz",
  ];

  const RETAIN_TOPICS = new Set(RETAIN_TOPIC_LIST);

  function brokerUrl() {
    const params = new URLSearchParams(global.location.search);
    const fromQuery = params.get("broker");
    if (fromQuery) {
      const trimmed = fromQuery.trim();
      try {
        global.localStorage.setItem(LS_BROKER_KEY, trimmed);
      } catch (_) {}
      return trimmed;
    }
    try {
      const stored = global.localStorage.getItem(LS_BROKER_KEY);
      if (stored) return stored.trim();
    } catch (_) {}
    return "ws://" + global.location.hostname + ":9001";
  }

  function payloadText(message) {
    if (message == null) return "";
    if (typeof message === "string") return message;
    if (message instanceof ArrayBuffer) {
      return new TextDecoder("utf-8").decode(message);
    }
    if (ArrayBuffer.isView(message)) {
      return new TextDecoder("utf-8").decode(message);
    }
    return String(message);
  }

  function defaultRetain(topic) {
    return RETAIN_TOPICS.has(topic);
  }

  function publish(client, topic, payload, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      if (!client || !client.connected) {
        reject(new Error("MQTT nincs csatlakozva."));
        return;
      }
      const retain = opts.retain !== undefined ? Boolean(opts.retain) : defaultRetain(topic);
      const qos = opts.qos !== undefined ? opts.qos : 0;
      client.publish(topic, payload, { qos: qos, retain: retain }, function (err) {
        if (err) reject(err);
        else resolve(null);
      });
    });
  }

  function subscribeAll(client, topics) {
    if (!client || !topics || !topics.length) return;
    for (const topic of topics) {
      client.subscribe(topic, { qos: 0 });
    }
  }

  /**
   * @param {object} options
   * @param {string[]} [options.topics] - topics to subscribe on connect
   * @param {function(string, string): void} [options.onMessage] - (topic, textPayload)
   * @param {function(string, string): void} [options.onStatus] - (state, detail)
   * @returns {object|null} mqtt client or null if mqtt missing
   */
  function connect(options) {
    options = options || {};
    const onStatus = options.onStatus || function () {};
    const onMessage = options.onMessage || function () {};
    const topics = options.topics || [];

    if (typeof global.mqtt === "undefined") {
      onStatus("error", "mqtt.min.js not loaded");
      return null;
    }

    const url = brokerUrl();
    onStatus("connecting", url);

    const client = global.mqtt.connect(url, {
      reconnectPeriod: 3000,
      clean: true,
      connectTimeout: 10000,
    });

    client.on("connect", function () {
      onStatus("connected", url);
      subscribeAll(client, topics);
    });

    client.on("reconnect", function () {
      onStatus("reconnecting", url);
    });

    client.on("close", function () {
      onStatus("disconnected", url);
    });

    client.on("error", function (err) {
      onStatus("error", String(err && err.message ? err.message : err));
    });

    client.on("message", function (topic, message) {
      onMessage(topic, payloadText(message));
    });

    return client;
  }

  global.NanoportalMqtt = {
    LS_BROKER_KEY: LS_BROKER_KEY,
    RETAIN_TOPICS: RETAIN_TOPICS,
    RETAIN_TOPIC_LIST: RETAIN_TOPIC_LIST,
    brokerUrl: brokerUrl,
    payloadText: payloadText,
    defaultRetain: defaultRetain,
    publish: publish,
    connect: connect,
  };
})(globalThis);
