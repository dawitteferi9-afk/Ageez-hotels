-- CreateTable
CREATE TABLE "RoomTypeTranslation" (
    "id" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomTypeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiKnowledgeDocumentTranslation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiKnowledgeDocumentTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomTypeTranslation_roomTypeId_idx" ON "RoomTypeTranslation"("roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomTypeTranslation_roomTypeId_locale_key" ON "RoomTypeTranslation"("roomTypeId", "locale");

-- CreateIndex
CREATE INDEX "AiKnowledgeDocumentTranslation_documentId_idx" ON "AiKnowledgeDocumentTranslation"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "AiKnowledgeDocumentTranslation_documentId_locale_key" ON "AiKnowledgeDocumentTranslation"("documentId", "locale");

-- AddForeignKey
ALTER TABLE "RoomTypeTranslation" ADD CONSTRAINT "RoomTypeTranslation_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiKnowledgeDocumentTranslation" ADD CONSTRAINT "AiKnowledgeDocumentTranslation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AiKnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
