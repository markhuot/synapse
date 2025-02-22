<?php

namespace Synapse\Laravel;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Synapse\Actions\HandleSynapseRequest;

class SynapseServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/config.php', 'synapse');
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Route::middleware(['web'])->group(function () {
            Route::post(config('synapse.handlerUri'), function(Request $request) {
                $payloads = $request->get('_payloads') ?: [];

                return app(HandleSynapseRequest::class, [
                    'path' => config('synapse.handlerFilesystemPath'),
                ])($payloads);
            });
        });
    }
}
