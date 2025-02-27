<?php

namespace Synapse\Actions;

use Illuminate\Http\Request;

class GetSetupProps
{
    public function __invoke(Request $request): array
    {
        $component = $request->route()->defaults['component'] ?? null;
        if (empty($component)) {
            return [];
        }

        $viewFinder = app('inertia.testing.view-finder');
        $path = $viewFinder->find($component);
        if (empty($path)) {
            return [];
        }

        $manifestPath = base_path('.synapse/manifest.json');
        if (! file_exists($manifestPath)) {
            return [];
        }

        $manifestContents = file_get_contents($manifestPath);
        $manifest = json_decode($manifestContents, true, 512, JSON_THROW_ON_ERROR);
        $setups = $manifest['setups'] ?? [];

        $relativePath = str_replace(base_path().'/', '', $path);
        if (empty($setups[$relativePath])) {
            return [];
        }

        $hash = $setups[$relativePath];
        return app(HandleSynapseRequest::class)([['hash' => $hash]]);
    }
}
