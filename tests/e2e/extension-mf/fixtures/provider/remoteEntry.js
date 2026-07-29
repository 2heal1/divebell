globalThis.divebell_e2e_provider = {
  async get(expose) {
    if (expose !== "./Widget") {
      throw new Error(`Unknown expose requested from provider: ${expose}`);
    }
    return () => ({
      render() {
        return "provider widget rendered";
      }
    });
  },
  init() {
    return undefined;
  }
};
