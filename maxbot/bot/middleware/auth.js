import { verifyJWT } from '../auth.js';
import { AUTH_COOKIE } from '../logger.js';

/**
 * Middleware для проверки JWT токена
 * Не блокирует запросы, только логирует и прикрепляет req.user
 */
export function authMiddleware(req, res, next) {
    const tokenCookie = req.cookies[AUTH_COOKIE];

    const authHeader = req.headers['authorization'];
    const tokenHeader = authHeader && authHeader.split(' ')[1];

    const token = tokenCookie || tokenHeader;
    
    if (!token) {
        console.warn(`[AUTH] Нет токена: ${req.method} ${req.path} от ${req.ip}`);
        req.user = null;
        return next();
    }
    
    const decoded = verifyJWT(token);
    if (!decoded) {
        console.warn(`[AUTH] Невалидный токен: ${req.method} ${req.path} от ${req.ip}`);
        req.user = null;
        return next();
    }
    
    req.user = decoded; // { user_id, is_admin, iat, exp }
    next();
}

/**
 * Middleware для ограничения доступа только с сайта и сервера
 */
export function originRestriction(req, res, next) {
    const referer = req.get('Referer');
    const host = req.get('Host');
    
    // Разрешаем запросы без Referer (с самого сервера, curl, etc.)
    if (!referer) {
        return next();
    }
    
    // Проверяем, что Referer содержит наш host
    try {
        const refererUrl = new URL(referer);
        if (refererUrl.host === host) {
            return next();
        }
    } catch (error) {
        console.error('[ORIGIN] Ошибка парсинга Referer:', error.message);
    }
    
    // Блокируем внешний запрос
    console.warn(`[ORIGIN] Внешний запрос заблокирован: ${req.ip} → ${req.path} (Referer: ${referer})`);
    res.status(403).json({ error: 'Access denied' });
}

/**
 * Middleware для блокировки POST/PUT/PATCH/DELETE для неавторизованных
 */
export function requireAuthForMutations(req, res, next) {
    const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    
    if (mutationMethods.includes(req.method) && !req.user) {
        console.warn(`[AUTH] ${req.method} запрещен для неавторизованного: ${req.path} от ${req.ip}`);
        return res.status(401).json({ error: 'Authentication required for this action' });
    }
    
    next();
}
