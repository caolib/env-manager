import { createApp } from "vue";
import "./main.css";
import "./ui/ui.css";

import App from './App.vue';
import { installLocalUi } from './ui';

const app = createApp(App);

app.use(installLocalUi)
    .mount('#app');
