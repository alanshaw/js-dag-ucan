import * as UCAN from "./ucan.js"
import * as DID from "./did.js"

/**
 * @template {UCAN.Capabilities} C
 */
export class View {
  /**
   * @param {UCAN.UCAN<C>} model
   */
  constructor(model) {
    /** @readonly */
    this.model = model
  }

  get version() {
    return this.model.v
  }

  get issuer() {
    return DID.from(this.model.iss)
  }

  get audience() {
    return DID.from(this.model.aud)
  }

  /**
   * @returns {C}
   */
  get capabilities() {
    return this.model.att
  }

  /**
   * @returns {number}
   */
  get expiration() {
    const { exp } = this.model
    return exp === null ? Infinity : exp
  }

  /**
   * @returns {undefined|number}
   */
  get notBefore() {
    return this.model.nbf
  }

  /**
   * @returns {undefined|string}
   */

  get nonce() {
    return this.model.nnc
  }

  /**
   * @returns {UCAN.Fact[]}
   */
  get facts() {
    return this.model.fct
  }

  /**
   * @returns {UCAN.Link[]}
   */

  get proofs() {
    return this.model.prf
  }

  get signature() {
    return this.model.s
  }

  // compatibility with UCAN.UCAN
  get jwt() {
    return this.model.jwt
  }
  get s() {
    return this.model.s
  }
  get v() {
    return this.model.v
  }
  get iss() {
    return this.model.iss
  }
  get aud() {
    return this.model.aud
  }
  get att() {
    return this.model.att
  }
  get exp() {
    return this.model.exp
  }
  get nbf() {
    return this.model.nbf
  }
  get nnc() {
    return this.model.nnc
  }
  get fct() {
    return this.model.fct
  }
  get prf() {
    return this.model.prf
  }
}
