-- Databases for the automated tests, created when the MySQL container starts for the first time.
CREATE DATABASE IF NOT EXISTS hello_world_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS hello_world_e2e CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON hello_world_test.* TO 'hello_world'@'%';
GRANT ALL PRIVILEGES ON hello_world_e2e.* TO 'hello_world'@'%';
