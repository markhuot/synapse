import {getRequestHandler} from "./request";
export * from "./request";

export function php(strings, ...params) {
    return {
        getPayload() {
            return {hash: strings[0], params};
        },
        execute(options={}) {
            const requestInit = normalizeRequestOptions(options);
            requestInit.body._payloads = [{hash:strings[0], params}];

            getRequestHandler()(requestInit)
        }
    }
}

export function compose(...codes) {
    const payloads = codes.map(code => code.getPayload());

    return {
        execute(options={}) {
            const requestInit = normalizeRequestOptions(options);
            requestInit.body._payloads = payloads;

            getRequestHandler()(requestInit)
        }
    }
}

function normalizeRequestOptions(options={}) {
    if (options instanceof FormData) {
        options = {body: Object.fromEntries(options.entries())};
    }

    if (options instanceof SubmitEvent) {
        options = {body: Object.fromEntries(options.formData.entries())};
    }

    options.url = options.url || '/synapse';
    options.method = options.method || 'post';
    options.body = options.body || {};

    return options;
}
