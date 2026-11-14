import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_in_prod';
const JWT_EXPIRES_IN = '365d'; // долгий срок жизни

/**
 * Генерация JWT токена
 * @param {object} payload - { user_id, is_admin }
 * @returns {string} JWT токен
 */
export function generateJWT(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Проверка JWT токена
 * @param {string} token - JWT токен
 * @returns {object|null} Декодированный payload или null
 */
export function verifyJWT(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        console.warn('[JWT] Ошибка проверки токена:', error.message);
        return null;
    }
}
