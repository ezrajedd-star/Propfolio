-- Undo 20261126180000_tickets. Tickets and their messages are removed (screenshots stay in
-- storage until removed by hand).
DROP TABLE IF EXISTS "TicketMessage";
DROP TABLE IF EXISTS "Ticket";
DROP TYPE IF EXISTS "TicketAuthor";
DROP TYPE IF EXISTS "TicketLanguage";
DROP TYPE IF EXISTS "TicketCategory";
DROP TYPE IF EXISTS "TicketStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261126180000_tickets';
