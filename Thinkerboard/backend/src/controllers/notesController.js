import mongoose from "mongoose";

import Note from "../models/Note.js";
import logger from "../lib/logger.js";
import { notesOperations } from "../lib/metrics.js";

const MAX_NOTES = Number(process.env.NOTES_LIMIT || 1000);

// A malformed id is the client's mistake (404), not a server failure (500)
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Missing title/content is a bad request (400), not a server failure (500)
function validationError(error, res) {
  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      message: "Invalid note",
      errors: Object.values(error.errors).map((e) => e.message),
    });
    return true;
  }
  return false;
}

function serverError(req, res, error, where) {
  (req.log || logger).error({ err: error }, `Error in ${where}`);
  res.status(500).json({ message: "Internal server error" });
}

export async function getAllNotes(req, res) {
  try {
    const notes = await Note.find().sort({ createdAt: -1 }).limit(MAX_NOTES); // newest first
    res.status(200).json(notes);
  } catch (error) {
    serverError(req, res, error, "getAllNotes");
  }
}

export async function getNoteById(req, res) {
  if (!isValidId(req.params.id)) return res.status(404).json({ message: "Note not found!" });
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: "Note not found!" });
    res.json(note);
  } catch (error) {
    serverError(req, res, error, "getNoteById");
  }
}

export async function createNote(req, res) {
  try {
    const { title, content } = req.body ?? {};
    const note = new Note({ title, content });

    const savedNote = await note.save();
    notesOperations.inc({ operation: "create" });
    res.status(201).json(savedNote);
  } catch (error) {
    if (validationError(error, res)) return;
    serverError(req, res, error, "createNote");
  }
}

export async function updateNote(req, res) {
  if (!isValidId(req.params.id)) return res.status(404).json({ message: "Note not found" });
  try {
    const { title, content } = req.body ?? {};
    const updatedNote = await Note.findByIdAndUpdate(
      req.params.id,
      { title, content },
      { new: true, runValidators: true }
    );

    if (!updatedNote) return res.status(404).json({ message: "Note not found" });

    notesOperations.inc({ operation: "update" });
    res.status(200).json(updatedNote);
  } catch (error) {
    if (validationError(error, res)) return;
    serverError(req, res, error, "updateNote");
  }
}

export async function deleteNote(req, res) {
  if (!isValidId(req.params.id)) return res.status(404).json({ message: "Note not found" });
  try {
    const deletedNote = await Note.findByIdAndDelete(req.params.id);
    if (!deletedNote) return res.status(404).json({ message: "Note not found" });
    notesOperations.inc({ operation: "delete" });
    res.status(200).json({ message: "Note deleted successfully!" });
  } catch (error) {
    serverError(req, res, error, "deleteNote");
  }
}
