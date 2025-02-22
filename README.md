Synapse
====

Write PHP code directly in Javascript and seamlessly transition data across the http boundry from client to server and back again.

```ts
import {php} from "@markhuot/synapse";

const toggleTodo = async (todoId) => `php
    $todo = \App\Models\Todo::findOrFail(${todoId});
    auth()->user()->can('update', $todo);

    $todo->complete = !$todo->complete;
    $todo->save();
`

const deleteTodo = async (todoId) => {
    if (! confirm('Are you sure you want to delete this todo?')) {
        return;
    }

    await php`
        $todo = \App\Models\Todo::findOrFail(${todoId});
        auth()->user()->can('delete', $todo);

        $todo->delete();
    `.execute();
}

export default function Todo({ todo }) {
    return <li>
        <input type="checkbox" onInput={event => toggleTodo(todo.id)}/>
        {todo.title}
        <button onClick={event => deleteTodo(todo.id)}>
            Delete
        </button>
    </div>;
}
```

Getting started
---

You need to configure boths sides of the client/server boundary to utilize Synapse. First, lets configure the server side.

> [!NOTE]
> If you're using Laravel the server side is automatically configured when you run `composer require markhuot/synapse`. You can skip to the client-side setup.

### Server-side

Synapse expects an HTTP handler listening at `/synapse`, by default. You can configure this on the front-end to another URI, if desired. However you're responding to routes, you'll need to process the POST data with `Synapse\Actions\HandleSynapseRequest`. Here's a basic example assuming this is inside a file at `/synapse/index.php`.

```php
$action = new Synapse\Actions\HandleSynapseRequest(
    path: '.synapse/handlers/'
);

$result = $action($_POST['_payloads']);

echo json_encode($result);
```

The result of a Synapse handler is variable and dependant on the code you write within your Javascript files. In this example we blindly convert to JSON. In reality the result may be more nuanced and you'll need to account for things like redirects, headers, etc.

### Client-side

Synapse works with any front-end framework that integrates with Vite as the Synapse compiler is written as a Vite plugin. Configuration happens in your `vite.config.js` file by adding the plugin function in to your definition,

```js
import {synapse} from 'synapse/vite';

export default defineConfig({
    plugins: [
        synapse({
            include: [/\.tsx$/],
            exclude: [/node_modules/],
            handlerPath: '.synapse/handlers/'
        }),
    ],
});
```

Every configuration key is optional and by default Synapse will scan through all files run through vite for `php` tagged templates.

Lastly, you need to configure your HTTP handler. Within a Laravel application this is typically done in `resources/js/app.js` but any entrypoint will do.

```js
import { router } from '@inertiajs/react';
import { setRequestHandler } from 'synapse/php';

setRequestHandler((options) => {
  return router.post(options.url, options.body, options);
})
```

If you do not set a request handler a default handler will make a request to `/synapse` with a correct POST body.

## How it works

When Vite compiles your JS it removes any `php` tagged template strings and moves each string in to its own `.php` file.

Then, when the client calls a `php` tagged template string: instead of parsing the string, it makes a HTTP request to your back-end with a payload containing a random hash identifying the block(s) of PHP to run.
