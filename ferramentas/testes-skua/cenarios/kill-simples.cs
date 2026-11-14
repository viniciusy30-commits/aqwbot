using Skua.Core.Interfaces;
public class Direct1
{
    public IScriptInterface Bot => IScriptInterface.Instance;
    public void ScriptMain(IScriptInterface bot)
    {
        Bot.Skills.StartAdvanced("1 | 2 | 3 | 4");
        Bot.Options.AcceptACDrops = false;
        Bot.Drops.Add("Slime Drop");
        Bot.Drops.Start();
        Bot.Map.Join("slime");
        Bot.Map.Jump("r1", "Left");
        int n = 0;
        while (!Bot.ShouldExit && Bot.Inventory.GetQuantity("Slime Drop") < 5 && n++ < 200)
        {
            Bot.Kill.Monster("Slime");
            Bot.Sleep(300);
        }
        Bot.Log("Slime Drop: " + Bot.Inventory.GetQuantity("Slime Drop"));
        Bot.Skills.Stop();
    }
}
