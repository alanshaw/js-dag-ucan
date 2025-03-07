/* eslint-env mocha */
import * as UCAN from "../src/lib.js"
import { assert } from "chai"
import { alice, bob, mallory, JWT_UCAN, JWT_UCAN_SIG } from "./fixtures.js"
import * as TSUCAN from "./ts-ucan.cjs"
import * as CBOR from "../src/codec/cbor.js"
import { encode as encodeCBOR } from "@ipld/dag-cbor"
import * as RAW from "multiformats/codecs/raw"
import * as UTF8 from "../src/utf8.js"
import * as DID from "../src/did.js"
import { identity } from "multiformats/hashes/identity"
import { base64url } from "multiformats/bases/base64"
import {
  decodeAuthority,
  createRSAIssuer,
  assertCompatible,
  assertUCAN,
  buildJWT,
  formatUnsafe,
} from "./util.js"
import { sha256 } from "multiformats/hashes/sha2"
import * as Signature from "../src/signature.js"

describe("dag-ucan", () => {
  it("self-issued token", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: alice,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    assertUCAN(ucan, {
      version: UCAN.VERSION,
      code: CBOR.code,
      issuer: DID.parse(alice.did()),
      audience: DID.parse(alice.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      notBefore: undefined,
      nonce: undefined,
      facts: [],
      proofs: [],
    })

    assert.ok(ucan.expiration > UCAN.now())
    assert.deepEqual(ucan.encode(), UCAN.encode(ucan))
    assert.deepEqual(ucan.format(), UCAN.format(ucan))
  })

  it("derive token", async () => {
    const root = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })
    const proof = await UCAN.link(root)
    assert.equal(proof.code, CBOR.code)

    const leaf = await UCAN.issue({
      issuer: bob,
      audience: mallory,
      capabilities: root.capabilities,
      expiration: root.expiration,
      proofs: [proof],
    })

    assertUCAN(leaf, {
      version: UCAN.VERSION,
      issuer: DID.parse(bob.did()),
      audience: DID.parse(mallory.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      notBefore: undefined,
      nonce: undefined,
      facts: [],
      proofs: [proof],
    })
  })

  it("rsa did", async () => {
    const bot = await createRSAIssuer()

    const root = await UCAN.issue({
      issuer: alice,
      audience: bot,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })
    const proof = await UCAN.link(root)

    const leaf = await UCAN.issue({
      issuer: bot,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      proofs: [proof],
    })

    assertUCAN(leaf, {
      version: UCAN.VERSION,
      issuer: DID.parse(bot.did()),
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      notBefore: undefined,
      nonce: undefined,
      facts: [],
      proofs: [proof],
    })

    // TODO: ts-ucan does not support cid as proof
    // await assertCompatible(leaf)
  })

  it("with nonce", async () => {
    const root = await UCAN.issue({
      issuer: alice,
      audience: bob,
      nonce: "hello",
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    await assertCompatible(root)
    assertUCAN(root, {
      version: UCAN.VERSION,
      issuer: DID.parse(alice.did()),
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      notBefore: undefined,
      nonce: "hello",
      facts: [],
      proofs: [],
    })
  })

  it("with facts", async () => {
    const root = await UCAN.issue({
      issuer: alice,
      audience: bob,
      facts: [
        {
          hello: "world",
        },
      ],
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    await assertCompatible(root)
    assertUCAN(root, {
      version: UCAN.VERSION,
      issuer: DID.parse(alice.did()),
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      facts: [
        {
          hello: "world",
        },
      ],
      notBefore: undefined,
      nonce: undefined,
      proofs: [],
    })
  })

  it("with notBefore", async () => {
    const now = UCAN.now()
    const root = await UCAN.issue({
      issuer: alice,
      audience: bob,
      facts: [],
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      notBefore: now + 10,
      expiration: now + 120,
    })

    assertUCAN(root, {
      version: UCAN.VERSION,
      issuer: DID.parse(alice.did()),
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      facts: [],
      notBefore: now + 10,
      expiration: now + 120,
      nonce: undefined,
      proofs: [],
    })
  })

  it("ts-ucan compat", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: alice,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    assert.ok(
      await TSUCAN.validate(UCAN.format(ucan), {
        checkIsExpired: true,
        checkIssuer: true,
        checkSignature: true,
      })
    )
  })

  it("permanent delegation", async () => {
    const delegation = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "*",
        },
      ],
      expiration: Infinity,
    })

    assertUCAN(delegation, {
      version: UCAN.VERSION,
      issuer: DID.parse(alice.did()),
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "*",
        },
      ],
      facts: [],
      notBefore: undefined,
      expiration: Infinity,
      nonce: undefined,
      proofs: [],
    })

    assert.equal(delegation.model.exp, null)
  })

  it("permanent delegation with null", async () => {
    const delegation = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "*",
        },
      ],
      // @ts-expect-error - expects Infinity instead
      expiration: null,
    })

    assertUCAN(delegation, {
      version: UCAN.VERSION,
      issuer: DID.parse(alice.did()),
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "*",
        },
      ],
      facts: [],
      notBefore: undefined,
      expiration: Infinity,
      nonce: undefined,
      proofs: [],
    })

    assert.equal(delegation.model.exp, null)
  })

  it("can delegate namespace", async () => {
    const delegation = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "account/*",
        },
      ],
      expiration: Infinity,
    })

    assertUCAN(delegation, {
      version: UCAN.VERSION,
      issuer: DID.parse(alice.did()),
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "account/*",
        },
      ],
      facts: [],
      notBefore: undefined,
      expiration: Infinity,
      nonce: undefined,
      proofs: [],
    })
  })

  it("can use did:web", async () => {
    const expiration = UCAN.now() + 120
    const delegation = await UCAN.issue({
      issuer: alice,
      audience: DID.parse("did:dns:web3.storage"),
      capabilities: [
        {
          with: alice.did(),
          can: "store/list",
        },
      ],
      expiration,
    })

    assertUCAN(delegation, {
      version: UCAN.VERSION,
      issuer: DID.parse(alice.did()),
      audience: DID.parse("did:dns:web3.storage"),
      capabilities: [
        {
          with: alice.did(),
          can: "store/list",
        },
      ],
      facts: [],
      notBefore: undefined,
      expiration,
      nonce: undefined,
      proofs: [],
    })
  })

  it("issue by arbitrary did", async () => {
    const signer = {
      /**
       * @returns {UCAN.DID}
       */
      did: () => "did:dns:alice.space",
      /**
       * @param {Uint8Array} payload
       */
      sign: payload => alice.sign(payload),
      get signatureAlgorithm() {
        return alice.signatureAlgorithm
      },
      get signatureCode() {
        return alice.signatureCode
      },
    }

    const ucan = await UCAN.issue({
      issuer: signer,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    const [head, body, sig] = UCAN.format(ucan).split(".")
    const payload = UTF8.encode(`${head}.${body}`)

    assertUCAN(ucan, {
      version: UCAN.VERSION,
      issuer: DID.parse("did:dns:alice.space"),
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      notBefore: undefined,
      nonce: undefined,
      facts: [],
      proofs: [],
    })

    assert.equal(await alice.verify(payload, ucan.signature), true)

    assert.ok(ucan.expiration > UCAN.now())
  })
})

describe("errors", () => {
  it("throws on bad audience", async () => {
    try {
      await UCAN.issue({
        issuer: alice,
        // @ts-expect-error
        audience: "bob",
        nonce: "hello",
        capabilities: [
          {
            with: alice.did(),
            can: "store/put",
          },
        ],
      })
      assert.fail("Should have thrown on bad did")
    } catch (error) {
      assert.match(String(error), /audience.did/)
    }
  })

  it("supports other DIDs", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: { did: () => "did:dns:ucan.storage" },
      nonce: "hello",
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    assert.equal(ucan.audience.did(), "did:dns:ucan.storage")
  })

  it("throws on unsupported algorithms", async () => {
    try {
      await UCAN.issue({
        issuer: alice,
        audience: {
          did: () =>
            "did:key:zZfaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169",
        },
        nonce: "hello",
        capabilities: [
          {
            with: alice.did(),
            can: "store/put",
          },
        ],
      })
      assert.fail("Should have thrown on bad did")
    } catch (error) {
      console.log("🚀 ~ file: lib.spec.js ~ line 329 ~ it ~ error", error)
      assert.match(
        String(error),
        /Unsupported DID encoding, unknown multicode 0x1/
      )
    }
  })

  it("throws on uncompressed p256 did", async () => {
    try {
      await UCAN.issue({
        issuer: alice,
        audience: {
          did: () =>
            "did:key:z4oJ8dmoanp9ZgWVcNgPretVkK3UNaDGdahF1jhKVXcvK17Ry1F6jAa7BvXvUAccw9w5SNHVVSTTDjJeS8wnb92VrsjxG",
        },
        nonce: "hello",
        capabilities: [
          {
            with: alice.did(),
            can: "store/put",
          },
        ],
      })
      assert.fail("Should have thrown on bad did")
    } catch (error) {
      assert.match(String(error), /Only p256-pub compressed is supported./)
    }
  })

  it("should pass for compressed p256 did", async () => {
    const did = "did:key:zDnaehbKF2iga4pf2D42ygGALc9EkQzTdcu43RpaAk45sUdW6"
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: {
        did: () => did,
      },
      nonce: "hello",
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    assert(ucan.audience.did() === did)
  })

  /** @type {Record<string, [UCAN.Capability, ?RegExp]>} */
  const invilidCapabilities = {
    'must have "can"': [
      // @ts-expect-error
      { with: alice.did() },
      /Capability has invalid 'can: undefined', value must be a string/,
    ],
    "must have path segment": [
      // @ts-expect-error
      { with: alice.did(), can: "send" },
      /Capability has invalid 'can: "send"', value must have at least one path segment/,
    ],
    "must have segment after path": [
      { with: alice.did(), can: "send/" },
      /Capability has invalid 'can: "send\/"', value must have at least one path segment/,
    ],
    "must have segment before path": [
      { with: alice.did(), can: "/send" },
      /Capability has invalid 'can: "\/send"', value must have at least one path segment/,
    ],

    "with must be string": [
      // @ts-expect-error
      {
        can: "msg/send",
      },
      /Capability has invalid 'with: undefined', value must be a string/,
    ],

    "with must have something prior to :": [
      {
        can: "msg/send",
        with: ":hello",
      },
      /Capability has invalid 'with: ":hello"', value must be a valid URI string/,
    ],

    "with can't be did": [
      // @ts-expect-error
      { with: alice, can: "send/message" },
      /Capability has invalid 'with: {.*}', value must be a string/,
    ],
    "with as:<did>:* may have can: *": [
      {
        with: `as:${alice.did()}:*`,
        can: "*",
      },
      null,
    ],

    "with my:* it may have can: *": [
      {
        with: "my:*",
        can: "*",
      },
      null,
    ],
  }

  for (const [title, [capability, expect]] of Object.entries(
    invilidCapabilities
  )) {
    it(title, async () => {
      try {
        await UCAN.issue({
          issuer: alice,
          audience: bob,
          capabilities: [capability],
        })

        if (expect) {
          assert.fail("Should throw error on invalid capability")
        }
      } catch (error) {
        if (expect) {
          assert.match(String(error), expect)
        } else {
          throw error
        }
      }
    })
  }

  it("proofs must be CIDs", () => {
    assert.throws(() => {
      UCAN.encode({
        v: "0.8.1",
        iss: DID.parse(alice.did()),
        aud: DID.parse(bob.did()),
        exp: Date.now(),
        att: [
          {
            with: "my:*",
            can: "*",
          },
        ],
        s: Signature.create(Signature.EdDSA, new Uint8Array()),
        prf: [
          // @ts-expect-error
          "bafkreihgufl2d3wwp4kjo75na265sywwi3yqcx2xpk3rif4tlo62nscg4m",
        ],
        fct: [],
      })
    }, /Expected prf\[0\] to be IPLD link, instead got "bafkr/)
  })

  it("proofs must be CIDs", () => {
    assert.throws(() => {
      UCAN.encode({
        v: "0.8.1",
        iss: DID.parse(alice.did()),
        // @ts-expect-error
        aud: bob.did(),
        exp: Date.now(),
        att: [
          {
            with: "my:*",
            can: "*",
          },
        ],
        s: Signature.create(Signature.EdDSA, new Uint8Array()),
        fct: [],
      })
    }, /Expected aud to be Uint8Array, instead got "did:key/)
  })

  it("expiration must be int", async () => {
    try {
      await UCAN.issue({
        expiration: 8.7,
        issuer: alice,
        audience: bob,
        capabilities: [
          {
            with: alice.did(),
            can: "store/add",
          },
        ],
      })
    } catch (error) {
      assert.match(String(error), /Expected exp to be integer, instead got 8.7/)
    }
  })

  it("signature must be Uint8Array", () => {
    assert.throws(() => {
      UCAN.encode({
        v: "0.8.1",
        iss: DID.parse(alice.did()),
        aud: DID.parse(bob.did()),
        exp: Date.now(),
        att: [
          {
            with: "my:*",
            can: "*",
          },
        ],
        // @ts-expect-error
        s: "hello world",
        fct: [],
        prf: [],
      })
    }, /Expected signature s, instead got "hello world"/)
  })
})

describe("parse", () => {
  it("errors on invalid jwt", async () => {
    const jwt = await buildJWT({ issuer: alice, audience: bob })
    assert.throws(
      () => UCAN.parse(jwt.slice(jwt.indexOf(".") + 1)),
      /Expected JWT format: 3 dot-separated/
    )
  })

  it("hash conistent ucan is parsed into IPLD representation", async () => {
    /** @type {UCAN.JWT<[{with: 'mailto:*', can: 'send/message'}]>} */
    const jwt = await formatUnsafe(alice, {
      body: {
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
      },
    })
    const ucan = UCAN.parse(jwt)

    const v2 = await UCAN.issue({
      issuer: alice,
      audience: alice,
      expiration: ucan.expiration,
      capabilities: [...ucan.capabilities],
    })

    assert.equal(ucan instanceof Uint8Array, false)
    assertUCAN(ucan, {
      version: UCAN.VERSION,
      issuer: DID.parse(alice.did()),
      audience: DID.parse(alice.did()),
      capabilities: [
        {
          can: "send/message",
          with: "mailto:*",
        },
      ],
      facts: [],
      notBefore: undefined,
      nonce: undefined,
      proofs: [],
      signature: v2.signature,
    })
  })

  it("errors on invalid nnc", async () => {
    const jwt = await formatUnsafe(alice, {
      body: {
        nnc: 5,
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
      },
    })

    assert.throws(() => UCAN.parse(jwt), /nnc has invalid value 5/)
  })

  it("errors on invalid nbf", async () => {
    const jwt = await formatUnsafe(alice, {
      body: {
        nbf: "tomorrow",
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
      },
    })

    assert.throws(
      () => UCAN.parse(jwt),
      /Expected nbf to be integer, instead got "tomorrow"/
    )
  })

  it("errors on invalid alg", async () => {
    const jwt = await formatUnsafe(alice, {
      header: {
        alg: "whatever",
      },
      body: {
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
      },
    })

    const ucan = UCAN.parse(jwt)
    assert.equal(ucan.signature.algorithm, "whatever")
    assert.equal(ucan.signature.code, 0xd000)
    assert.equal(
      jwt.endsWith(`.${base64url.baseEncode(ucan.signature.raw)}`),
      true
    )
    assert.equal(ucan.issuer.did(), alice.did())
  })

  it("errors on invalid typ", async () => {
    const jwt = await formatUnsafe(alice, {
      header: {
        typ: "IPLD",
      },
      body: {
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
      },
    })

    assert.throws(
      () => UCAN.parse(jwt),
      /Expected typ to be a "JWT" instead got "IPLD"/
    )
  })

  it("errors on invalid ucv", async () => {
    const jwt = await formatUnsafe(alice, {
      header: {
        ucv: "9.0",
      },
      body: {
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
      },
    })

    assert.throws(() => UCAN.parse(jwt), /Invalid version 'ucv: "9.0"'/)
  })

  it("errors on invalid att", async () => {
    const jwt = await formatUnsafe(alice, {
      body: {
        att: {
          can: "send/message",
          with: "mailto:*",
        },
      },
    })

    assert.throws(() => UCAN.parse(jwt), /att must be an array/)
  })

  it("errors on invalid fct", async () => {
    const jwt = await formatUnsafe(alice, {
      body: {
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
        fct: [1],
      },
    })

    assert.throws(() => UCAN.parse(jwt), /fct\[0\] must be of type object/)
  })

  it("errors on invalid aud", async () => {
    const jwt = await formatUnsafe(alice, {
      body: {
        aud: "bob",
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
        fct: [1],
      },
    })

    assert.throws(
      () => UCAN.parse(jwt),
      /Invalid DID "bob", must start with 'did:/
    )
  })

  it("errors on invalid prf (must be array of string)", async () => {
    const jwt = await formatUnsafe(alice, {
      body: {
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
        prf: [1],
      },
    })

    assert.throws(() => UCAN.parse(jwt), /prf\[0\] has invalid value 1/)
  })

  it("errors on invalid prf", async () => {
    const jwt = await formatUnsafe(alice, {
      body: {
        att: [
          {
            can: "send/message",
            with: "mailto:*",
          },
        ],
        prf: {},
      },
    })

    assert.throws(() => UCAN.parse(jwt), /prf must be an array/)
  })
})

describe("encode <-> decode", () => {
  it("issued ucan is equal to decoded ucan", async () => {
    const expected = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    const actual = UCAN.decode(UCAN.encode(expected))
    assert.deepEqual(expected, actual)
  })

  it("can leave out optionals", async () => {
    const v1 = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: "my:*",
          can: "*",
        },
      ],
    })

    const v2 = UCAN.encode(
      // @ts-expect-error - leaving out proofs and facts
      {
        v: v1.version,
        iss: v1.issuer,
        aud: v1.audience,
        exp: v1.expiration,
        att: [...v1.capabilities],
        s: v1.signature,
      }
    )

    assert.deepEqual(v2, UCAN.encode(v1))
  })

  it("can contain facts", async () => {
    const expected = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      facts: [{ hello: "world" }],
    })

    const actual = UCAN.decode(UCAN.encode(expected))
    assert.deepEqual(expected, actual)
  })

  it("can contain nonce", async () => {
    const expected = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      nonce: "nonsense ",
    })

    const actual = UCAN.decode(UCAN.encode(expected))
    assert.deepEqual(expected, actual)
  })

  it("can contain notBefore", async () => {
    const now = UCAN.now()
    const expected = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      notBefore: now + 10,
      expiration: now + 120,
    })

    const actual = UCAN.decode(UCAN.encode(expected))
    assert.deepEqual(expected, actual)
  })

  it("fails on bad model", async () => {
    const now = UCAN.now()
    const { model } = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
      notBefore: now + 10,
      expiration: now + 120,
    })

    const { iss, aud, s, nnc, ...body } = model

    console.log(body)

    const bytes = encodeCBOR({
      ...body,
      iss: DID.encode(iss),
      aud: DID.encode(aud),
      s: "hello",
    })

    assert.throws(() => UCAN.decode(bytes))
  })
})

describe("ts-ucan compat", () => {
  it("round-trips with token.build", async () => {
    const jwt = await buildJWT({ issuer: alice, audience: bob })
    const ucan = UCAN.parse(jwt)

    assertUCAN(ucan, {
      code: RAW.code,
      version: "0.8.1",
      issuer: DID.parse(alice.did()),
      audience: DID.parse(bob.did()),
      facts: [],
      proofs: [],
      notBefore: undefined,
      nonce: undefined,
      capabilities: [
        {
          with: "wnfs://boris.fission.name/public/photos/",
          can: "crud/delete",
        },
        {
          with: "wnfs://boris.fission.name/private/84MZ7aqwKn7sNiMGsSbaxsEa6EPnQLoKYbXByxNBrCEr",
          can: "wnfs/append",
        },
        { with: "mailto:boris@fission.codes", can: "msg/send" },
      ],
    })

    assert.equal(UCAN.format(ucan), jwt)
    assert.equal(ucan.format(), jwt)
    assert.deepEqual(ucan.encode(), UCAN.encode(ucan))
    assert.equal(UCAN.decode(ucan.encode()).code, RAW.code)

    const cid = await UCAN.link(ucan)
    assert.equal(cid.code, RAW.code)
  })

  it("can have inline proofs", async () => {
    const root = await buildJWT({
      issuer: alice,
      audience: bob,
    })

    const leaf = await buildJWT({
      issuer: bob,
      audience: mallory,
      proofs: [root],
    })

    const ucan = UCAN.parse(leaf)
    assertUCAN(ucan, {
      version: "0.8.1",
      issuer: DID.parse(bob.did()),
      audience: DID.parse(mallory.did()),
      facts: [],
      notBefore: undefined,
      nonce: undefined,
      capabilities: [
        {
          with: "wnfs://boris.fission.name/public/photos/",
          can: "crud/delete",
        },
        {
          with: "wnfs://boris.fission.name/private/84MZ7aqwKn7sNiMGsSbaxsEa6EPnQLoKYbXByxNBrCEr",
          can: "wnfs/append",
        },
        { with: "mailto:boris@fission.codes", can: "msg/send" },
      ],
    })

    const [proof] = ucan.proofs

    assert.equal(proof.code, RAW.code)
    assert.equal(proof.multihash.code, identity.code)

    assert.equal(UTF8.decode(proof.multihash.digest), root)
  })
})

describe("api compatibility", () => {
  it("multiformats compatibility", async () => {
    const Block = await import("multiformats/block")
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    const block = await Block.encode({
      value: ucan,
      codec: UCAN,
      hasher: sha256,
    })

    const { cid, bytes } = await UCAN.write(ucan, { hasher: sha256 })
    assert.deepEqual(cid, block.cid)
    assert.deepEqual(bytes, /** @type {Uint8Array} */ (block.bytes))
    assert.deepEqual(block.value, ucan)
  })
})

describe("jwt representation", () => {
  it("can parse non cbor UCANs", async () => {
    const jwt = UCAN.parse(JWT_UCAN)
    assert.equal(jwt.code, RAW.code)

    assertUCAN(jwt, {
      issuer: DID.parse(alice.did()),
      audience: DID.parse(bob.did()),
      expiration: 1650500849,
      nonce: undefined,
      notBefore: undefined,
      facts: [],
      proofs: [],
      capabilities: [
        {
          with: "wnfs://boris.fission.name/public/photos/",
          can: "crud/delete",
        },
        {
          with: "wnfs://boris.fission.name/private/84MZ7aqwKn7sNiMGsSbaxsEa6EPnQLoKYbXByxNBrCEr",
          can: "wnfs/append",
        },
        { with: "mailto:boris@fission.codes", can: "msg/send" },
      ],
      signature: JWT_UCAN_SIG,
    })
  })

  it("can encode non cbor UCANs", () => {
    const jwt = UCAN.parse(JWT_UCAN)
    assert.equal(jwt.code, RAW.code)

    const bytes = UCAN.encode(jwt)
    const jwt2 = assert.equal(JWT_UCAN, UCAN.format(UCAN.decode(bytes)))
  })

  it("can still decode into jwt representation", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: bob,
      capabilities: [
        {
          can: "access/identify",
          with: "did:key:*",
          nb: {
            as: "mailto:*",
          },
        },
      ],
    })

    const token = UCAN.format(ucan)
    const cbor = UCAN.parse(token)
    const jwt = UCAN.decode(UTF8.encode(token))

    assert.equal(cbor instanceof Uint8Array, false)
    assertUCAN(cbor, {
      issuer: DID.from(alice.did()),
      audience: DID.from(bob.did()),
      capabilities: [
        {
          can: "access/identify",
          with: "did:key:*",
          nb: { as: "mailto:*" },
        },
      ],
      expiration: ucan.expiration,
      signature: ucan.signature,
    })

    assert.equal(jwt.code, RAW.code)
    assertUCAN(jwt, {
      issuer: DID.parse(alice.did()),
      audience: DID.parse(bob.did()),
      capabilities: [
        {
          can: "access/identify",
          with: "did:key:*",
          nb: { as: "mailto:*" },
        },
      ],
      expiration: ucan.expiration,
      signature: ucan.signature,
    })
  })
})

describe("did", () => {
  it("parse", () => {
    const did = DID.parse(alice.did())
    assert.equal(did.did(), alice.did())
  })

  it("decode", () => {
    const bytes = new Uint8Array(DID.parse(alice.did()))
    assert.equal(DID.decode(bytes).did(), alice.did())
  })

  it("from string", () => {
    const did = DID.from(alice.did())
    assert.equal(did.did(), alice.did())
  })

  it("from bytes", () => {
    const bytes = new Uint8Array(DID.parse(alice.did()))
    const did = DID.from(bytes)
    assert.equal(did.did(), alice.did())
  })

  it("from did", () => {
    const did = DID.parse(alice.did())
    assert.equal(DID.from(did), did)
  })
})

describe("verify", () => {
  it("expired", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: alice,
      expiration: UCAN.now() - 10, // expires 10 seconds ago
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    assert.equal(UCAN.isExpired(ucan), true)
    assert.equal(UCAN.isTooEarly(ucan), false)
  })

  it("too early", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: alice,
      notBefore: UCAN.now() + 10, // valid in 10 seconds
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    assert.equal(UCAN.isExpired(ucan), false)
    assert.equal(UCAN.isTooEarly(ucan), true)
  })

  it("invalid time range", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: alice,
      expiration: UCAN.now() - 10,
      notBefore: UCAN.now() + 10,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    assert.equal(UCAN.isExpired(ucan), true)
    assert.equal(UCAN.isTooEarly(ucan), true)
  })

  it("verify signatures", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: alice,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    assert.equal(
      await UCAN.verifySignature(ucan, decodeAuthority(ucan.issuer)),
      true
    )
  })

  it("invalid signature", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: alice,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    const fake = await UCAN.issue({
      issuer: alice,
      audience: alice,
      capabilities: [
        {
          with: alice.did(),
          can: "store/fake",
        },
      ],
    })

    Object.defineProperties(ucan, {
      signature: { value: fake.signature },
    })

    assert.equal(
      await UCAN.verifySignature(ucan, decodeAuthority(ucan.issuer)),
      false
    )
  })

  it("invalid signer", async () => {
    const ucan = await UCAN.issue({
      issuer: alice,
      audience: alice,
      capabilities: [
        {
          with: alice.did(),
          can: "store/put",
        },
      ],
    })

    assert.equal(
      await UCAN.verifySignature(ucan, decodeAuthority(DID.parse(bob.did()))),
      false
    )
  })
})
