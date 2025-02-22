let makeRequest = (request) => {
    request.body = JSON.stringify(request.body);
    return fetch(request.url, request);
}

export function setRequestHandler(newHandler) {
    makeRequest = newHandler;
}

export function getRequestHandler() {
    return makeRequest;
}
