import {getRequestHandler} from "./request";
export * from "./request";

export function php(strings, ...params) {
    return {
        getPayload() {
            return {hash: strings[0], params};
        },
        execute(options={}) {
            const requestInit = normalizeRequestOptions(options);
            addPayloadToBody(requestInit.body, 0, strings[0], params);

            return getRequestHandler()(requestInit)
        }
    }
}

export function compose(...codes) {
    const payloads = codes.map(code => code.getPayload());

    return {
        execute(options={}) {
            const requestInit = normalizeRequestOptions(options);
            payloads.forEach(({hash, params}, index) => addPayloadToBody(requestInit.body, index, hash, params));

            return getRequestHandler()(requestInit)
        }
    }
}

function normalizeRequestOptions(options={}) {
    if (options instanceof FormData) {
        options = {body: options};
    }

    if (options instanceof SubmitEvent) {
        options = {body: options.formData};
    }

    options.url = options.url || '/synapse';
    options.method = options.method || 'post';
    options.body = options.body || {};

    return options;
}

function addPayloadToBody(body, payloadIndex, hash, params) {
    if (body instanceof FormData) {
        body.set(`_payloads[${payloadIndex}][hash]`, hash);
        params.forEach((param, index) => {
            body.set(`_payloads[${payloadIndex}][params][${index}]`, param);
        });
    }
    else {
        body._payloads = body._payloads || {};
        body._payloads[payloadIndex] = {hash, params};
    }
}
