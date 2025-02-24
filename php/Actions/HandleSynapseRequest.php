<?php

namespace Synapse\Actions;

class HandleSynapseRequest
{
    public function __construct(
        protected string $path,
    ) {
        $this->path = rtrim($path, '/');
    }

    /**
     * @param array<array{hash:string, params:array<array-key, mixed>}> $payloads
     */
    public function __invoke(array $payloads)
    {
        $result = null;

        if (empty($payloads)) {
            throw new \RuntimeException('Missing payloads');
        }

        foreach ($payloads as $payload) {
            $hash = $payload['hash'];
            $params = $payload['params'];
            foreach ($params as $key => $value) {
                ${"variable".$key} = $value;
            }
            unset($params);
            $result = require($this->path . '/' . $hash . '.php');
        }

        if ($result === 1) {
            return;
        }

        return $result;
    }
}
