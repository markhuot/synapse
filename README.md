Synapse
====

Write PHP code directly in Javascript and seamlessly transition data across the http boundry from client to server and back again.

```ts
import {php} from "@markhuot/synapse/php";

const toggleTodo = async (todoId) => `php
    $todo = \App\Models\Todo::findOrFail(${todoId});
    auth()->user()->can('update', $todo);

    $todo->complete = !$todo->complete;
    $todo->save();
`.execute()

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
> If you're using Laravel the server-side is automatically configured when you run `composer require markhuot/synapse`. You can skip to the client-side setup.

### Server-side

Synapse expects an HTTP handler listening at `/synapse`, by default. You can configure this on the front-end to another URI, if desired. However you're responding to routes, you'll need to process the POST data with `Synapse\Actions\HandleSynapseRequest`. Here's a basic example assuming this is inside a file at `/synapse/index.php`.

```php
$action = new Synapse\Actions\HandleSynapseRequest(
    path: PROJECT_ROOT.'/.synapse/handlers/'
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

here is an example of configuring Synapse with Inertia/React,

```js
import { router } from '@inertiajs/react';
import { setRequestHandler } from 'synapse/php';

setRequestHandler((options) => {
  return router.post(options.url, options.body, options);
})
```

If you do not set a request handler a default handler will make a request to `/synapse` with a correct POST body.

## How it works

When Vite compiles your JS it removes any `php` tagged template strings and moves each template string in to its own `.php` file.

As the PHP code is moved to its own file the JS file is updated with a pseudo random hash. The raw PHP is removed. This means your PHP code is never sent to the client and is not inspectable.

> [!NOTE]
> The hashes generated for each template string are pseudo random and are not reproducible. Because of that you should not share generated php files across computers. The .synapse directory should be .gitignored and re-generated in dev, staging, and production--just like you would your compiled JS.

When the client calls a `php` tagged template string: instead of parsing the string, it makes a HTTP request to your back-end with a payload containing a random hash identifying the block(s) of PHP to run.

The real magic is in how Javascript handles tagged template strings. Here's a very. brief example,

```js
const firstName = 'Michael';
const lastName = 'Bluth';
php`echo "${lastName}, ${firstName}";`
```

In that example the synapse/php template gets called with string parameters matching `"echo \""`, `", "` and `"\";"`. It also gets called with value parameters matching the values of `lastName` and `firstName`.

On the client-side we ignore the strings entirely (in fact Vite replaces them out with empty strings so your PHP is not leaked). Then, we can pull out the values and send just the values across the HTTP boundary to the server.

That leaves us with the above source JS that compiles to the following compiled JS (where `ahufduah` is a pseudo random hash generated during the compilation step).

```js
const firstName = 'Michael';
const lastName = 'Bluth';
php`ahufduah${lastName}${firstName}`
```

The compiled PHP looks like this, after swapping out the JS variables for PHP variables:

```php
<?php

echo "$variable0, $variable1";
```

Lastly, we can make a HTTP request with the following payload,

```http
POST /synapse
{"_payloads":[{"hash":"ahufduah","params":["Bluth","Michael"]}]}
```

That HTTP request uses the payload to route to the PHP file and execute it with the passed params.

Writing PHP
---

Writing PHP happens in a `php` tagged template string. It should look like this:

```js
php`return "Hi from the server.";`
```

Tagged template strings don't execute immediately, we'll see why in a moment. To make an Ajax request and execute the PHP you have to call `execute()` on the string. For example,

```js
php`return "Hi from the server.";`.execute()
```

Calling execute returns a promise which is resolved with any data retuened from the server. That allows you to pass data both ways across the HTTP boundary,

```js
const name = 'Michael';
const upperName = await php`return strtoupper(${name});`
  .execute()
  .then(res => res.text());
```

The execute call accepts a variety of data to configure the resulting Ajax request. You can send a plain object with keys that align with a `fetch()` init object.

```js
php`...`.execute({
  headers: { 'content-type': 'text/plain' },
  body: { additional: 'params' },
  method: 'put',
})
```
Execute can also be passed `FormData` or a `SubmitEvent` and the form will be serialized and submitted. That means both of these are valid too. Note the lack of `()` when using the tagged template string as a handler,

```js
<form action={php`...`.execute}>
<form onSubmit={php`...`.execute}>
```

### Composing PHP


You may find yourself repeating yourself a lot in various PHP strings because each handler is executed fresh. To keep code dry you can "compose" multiple strings together in to a single request.

```js
import {php,compose} from "@markhuot/synapse/php";

const preamble = todoId => php`
  use \App\Models\Todo;
  $todo = Todo::find(${todoId});
  Gate('update', $todo);
`;

const postscript = php`
  Log::info("Todo $todo->id updated");
`;

const toggleTodoCompleted = todoId => compose(
  preamble(todoId),
  php`$todo->toggleComplete();`,
  postscript,
).execute();
```

On the server these are all still saved out as separate files. but they are executed in order within the same scope so variables can be shared between files.
