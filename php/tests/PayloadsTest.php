<?php

use Synapse\Actions\HandleSynapseRequest;

test('errors on missing payload', function () {
    $this->expectException(ArgumentCountError::class);

    (new HandleSynapseRequest('./'))();
});

test('errors on empty payload', function () {
    $this->expectException(RuntimeException::class, 'Missing payloads');

    (new HandleSynapseRequest('./'))([]);
});
