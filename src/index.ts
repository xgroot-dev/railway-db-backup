import { backup } from "./backup";

const tryBackup = async () => {
  try {
    await backup();
  } catch (error) {
    console.error("Error while running backup: ", error)
  }
}

console.log("Running backup...")
tryBackup();
console.log("Done!")
