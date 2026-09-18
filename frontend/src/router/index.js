import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Sala from '../views/Sala.vue'

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/sala/:codigo', name: 'sala', component: Sala },
  ],
})
